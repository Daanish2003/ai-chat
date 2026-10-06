import type { Session } from "@ai-chat/auth";
import { storedParts } from "@ai-chat/db/message-parts";
import { conversation, message } from "@ai-chat/db/schema/chat";
import { toServerSentEventsResponse } from "@tanstack/ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { providerLabel } from "../credentials/services";
import { loadCredentials } from "../credentials/store";
import type { AppDeps } from "../deps";
import { uuidv7 } from "../lib/uuidv7";
import { findModel } from "./models";
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
  // Later features: regenerate (no text), attachments and web search.
  if (command.text === undefined) return refuse(400, "Regenerating isn't available yet");
  if (command.attachmentIds.length > 0) return refuse(400, "Attachments aren't available yet");

  const chat = await findConversation(deps, userId, command.conversationId);
  if (!chat) return refuse(404, "Conversation not found");

  const model = findModel(command.model);
  if (!model) return refuse(400, `"${command.model}" is not an available Model`);
  const credentials = await loadCredentials(deps, userId, model.provider);
  if (!credentials) {
    return refuse(400, `Add an ${providerLabel(model.provider)} key or pick another Model`);
  }

  const history = await loadPath(deps, chat.id, command.parentId);
  if (command.parentId && history.length === 0) {
    return refuse(400, "The parent Message is not in this Conversation");
  }

  const userParts = storedParts([{ type: "text", text: command.text }]);
  const userMessageId = uuidv7();
  const assistantMessageId = uuidv7();
  const now = new Date();
  await deps.db.transaction(async (tx) => {
    await tx.insert(message).values([
      {
        id: userMessageId,
        conversationId: chat.id,
        parentId: command.parentId,
        role: "user",
        parts: userParts,
        searchText: searchTextOf(userParts),
        status: "complete",
        createdAt: now,
      },
      {
        id: assistantMessageId,
        conversationId: chat.id,
        parentId: userMessageId,
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
      .where(eq(conversation.id, chat.id));
  });

  const messages = toModelMessages([
    ...history.map((row) => ({ role: row.role, parts: parseStoredParts(row.parts) })),
    { role: "user", parts: userParts },
  ]);
  const chunks = startRun(deps, {
    messageId: assistantMessageId,
    adapter: deps.adapterFor(model.id, credentials),
    messages,
  });
  return toServerSentEventsResponse(chunks);
}
