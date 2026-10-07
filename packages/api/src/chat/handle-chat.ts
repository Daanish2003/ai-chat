import type { Session } from "@ai-chat/auth";
import { storedParts } from "@ai-chat/db/message-parts";
import { conversation, message } from "@ai-chat/db/schema/chat";
import { toServerSentEventsResponse } from "@tanstack/ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { addKeyMessage, tavilyService } from "../credentials/services";
import { loadCredentials } from "../credentials/store";
import type { AppDeps } from "../deps";
import { uuidv7 } from "../lib/uuidv7";
import { resolveModel } from "./available-models";
import { parseStoredParts, searchTextOf, toModelMessages } from "./parts";
import { startRun } from "./run";
import { findConversation, loadPath } from "./store";

/**
 * What the client asks for: a command, never history (ADR 0001). History is rebuilt from the
 * database by walking up from `parentId`. `useChat` sends it as the AG-UI `forwardedProps`.
 */
export const chatCommandSchema = z.object({
  conversationId: z.uuid(),
  /** The Message the new one continues; `null` starts at the root. */
  parentId: z.uuid().nullable(),
  /** The user's text. Without it the command is a regenerate. */
  text: z.string().trim().min(1).optional(),
  attachmentIds: z.array(z.uuid()).default([]),
  /** `"provider:model"` */
  model: z.string(),
  webSearch: z.boolean().default(false),
});

export type ChatCommand = z.input<typeof chatCommandSchema>;

const refuse = (status: number, message: string) => Response.json({ message }, { status });

/** `/api/chat`: starts a run for the command and streams it back as server-sent events. */
export async function handleChat(
  request: Request,
  session: Session | null,
  deps: AppDeps,
): Promise<Response> {
  if (!session?.user) return refuse(401, "Sign in to chat");
  const userId = session.user.id;

  const body: unknown = await request.json().catch(() => undefined);
  const parsed = chatCommandSchema.safeParse(
    body && typeof body === "object" && "forwardedProps" in body ? body.forwardedProps : undefined,
  );
  if (!parsed.success) return refuse(400, "Invalid chat command");
  const command = parsed.data;
  // A later feature: attachments.
  if (command.attachmentIds.length > 0) return refuse(400, "Attachments aren't available yet");

  const owned = await findConversation(deps, userId, command.conversationId);
  if (!owned) return refuse(404, "Conversation not found");

  const model = await resolveModel(deps, userId, command.model);
  if (!model) return refuse(400, `"${command.model}" is not an available Model`);
  const credentials = await loadCredentials(deps, userId, model.provider);
  if (!credentials) return refuse(400, addKeyMessage(model.provider));
  // `web_search` is offered only when asked for, the Model has tools and the user has a Tavily key.
  const searchCredentials =
    command.webSearch && model.tools ? await loadCredentials(deps, userId, tavilyService) : null;

  const history = await loadPath(deps, owned.id, command.parentId);
  if (command.parentId && history.length === 0) {
    return refuse(400, "The parent Message is not in this Conversation");
  }
  // A regenerate (no text) answers its parent again, so the parent must be the user's Message.
  if (command.text === undefined && history.at(-1)?.role !== "user") {
    return refuse(400, "Only a reply to your Message can be regenerated");
  }

  // Everything that can fail runs before the Messages are written.
  const adapter = deps.adapterFor(model.id, credentials);
  const userParts =
    command.text === undefined ? undefined : storedParts([{ type: "text", text: command.text }]);
  const messages = toModelMessages(
    [
      ...history.map((row) => ({
        role: row.role,
        parts: parseStoredParts(row.parts),
        model: row.model,
      })),
      ...(userParts ? [{ role: "user" as const, parts: userParts }] : []),
    ],
    { provider: model.provider, webSearch: searchCredentials !== null },
  );
  const userMessageId = uuidv7();
  const assistantMessageId = uuidv7();
  const now = new Date();
  const started = await deps.db.transaction(async (tx) => {
    // One run per Conversation (ADR 0002). Locking the Conversation row queues concurrent sends
    // here, so the later one sees the earlier one's streaming Message.
    await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(eq(conversation.id, owned.id))
      .for("update");
    const [running] = await tx
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.conversationId, owned.id), eq(message.status, "streaming")))
      .limit(1);
    if (running) return false;

    await tx.insert(message).values([
      // An edit is a new user Message beside the one it replaces; a regenerate writes none.
      ...(userParts
        ? [
            {
              id: userMessageId,
              conversationId: owned.id,
              parentId: command.parentId,
              role: "user" as const,
              parts: userParts,
              searchText: searchTextOf(userParts),
              status: "complete" as const,
              createdAt: now,
            },
          ]
        : []),
      {
        id: assistantMessageId,
        conversationId: owned.id,
        parentId: userParts ? userMessageId : command.parentId,
        role: "assistant",
        parts: storedParts([]),
        model: model.id,
        status: "streaming",
        createdAt: new Date(now.getTime() + 1),
      },
    ]);
    await tx
      .update(conversation)
      .set({ activeLeafId: assistantMessageId, lastMessageAt: now, model: model.id })
      .where(eq(conversation.id, owned.id));
    return true;
  });
  if (!started) return refuse(409, "A reply is still streaming in this Conversation");

  const chunks = startRun(deps, {
    messageId: assistantMessageId,
    adapter,
    messages,
    webSearch: searchCredentials ?? undefined,
  });
  return toServerSentEventsResponse(chunks);
}
