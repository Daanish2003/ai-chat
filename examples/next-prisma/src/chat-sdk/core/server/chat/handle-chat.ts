import { storedParts } from "../../shared/message-parts";
import { conversation, message } from "../db/schema/chat";
import { resumeServerSentEventsResponse } from "@tanstack/ai";
import { and, eq } from "drizzle-orm";

import { attachmentsForSend } from "../attachments/send";
import { linkAttachments, lockAttachments } from "../attachments/store";
import { addKeyMessage, tavilyService } from "../../shared/credentials/services";
import { resolveCredentials, resolveModelCall } from "../credentials/resolve";
import type { AppDeps } from "../deps";
import type { ChatUser } from "../context";
import { uuidv7 } from "../lib/uuidv7";
import { rateLimitedFor } from "../rate-limits";
import { resolveModel } from "./available-models";
import { parseStoredParts, searchTextOf, toModelMessages } from "../../shared/chat/parts";
import { chatCommandSchema } from "../../shared/chat/command";
import { runStreamDurability, START } from "./run-streams";
import { startRun } from "./run";
import { findConversation, loadPath } from "./store";
import { loadSettings } from "../settings/store";
import { systemPromptsFor } from "./system-prompts";
import { quotaExceededCode, quotaRefusal } from "./quota";
import { generationOptionsFor } from "./generation";

const refuse = (status: number, message: string) => Response.json({ message }, { status });

/** `POST ${basePath}/run`: starts a run for the command and streams it back as server-sent events. */
export async function handleChat(
  request: Request,
  user: ChatUser,
  deps: AppDeps,
): Promise<Response> {
  const userId = user.id;

  const retryAfter = await rateLimitedFor(
    deps.counters,
    deps.rateLimits.runStart,
    `run-start:${userId}`,
  );
  if (retryAfter !== null) {
    return Response.json(
      { message: "Too many messages; try again in a moment" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body: unknown = await request.json().catch(() => undefined);
  const parsed = chatCommandSchema.safeParse(
    body && typeof body === "object" && "forwardedProps" in body ? body.forwardedProps : undefined,
  );
  if (!parsed.success) return refuse(400, "Invalid chat command");
  const command = parsed.data;
  const attachmentIds = [...new Set(command.attachmentIds)];
  if (command.text === undefined && attachmentIds.length > 0) {
    return refuse(400, "A regenerate can't add attachments; edit the Message instead");
  }

  const owned = await findConversation(deps, userId, command.conversationId);
  if (!owned) return refuse(404, "Conversation not found");

  const model = await resolveModel(deps, userId, command.model);
  if (!model) return refuse(400, `"${command.model}" is not an available Model`);
  const call = await resolveModelCall(deps, userId, model.id);
  if (!call) return refuse(400, addKeyMessage(model.provider));
  // A Run on Host credentials is refused once its Quota's window has spent the budget (ADR 0007).
  if (call.hostModel) {
    const refusal = await quotaRefusal(deps, userId);
    if (refusal) {
      return Response.json(
        {
          message:
            "You've used this window's Quota; try again after it resets, or add your own key",
          code: quotaExceededCode,
          resetsAt: refusal.resetsAt.toISOString(),
        },
        { status: 402 },
      );
    }
  }
  // `web_search` is offered only when asked for, the Model has tools and the user has a Tavily key.
  const searchCredentials =
    command.webSearch && model.tools ? await resolveCredentials(deps, userId, tavilyService) : null;
  // Read now, so a Run keeps the Instructions it started with; a regenerate or edit reads them anew.
  const { instructions } = await loadSettings(deps, userId);
  const systemPrompts = systemPromptsFor({
    webSearch: searchCredentials !== null,
    instructions,
  });

  const history = await loadPath(deps, owned.id, command.parentId);
  if (command.parentId && history.length === 0) {
    return refuse(400, "The parent Message is not in this Conversation");
  }
  // A regenerate (no text) answers its parent again, so the parent must be the user's Message.
  if (command.text === undefined && history.at(-1)?.role !== "user") {
    return refuse(400, "Only a reply to your Message can be regenerated");
  }
  const attachments = await attachmentsForSend(deps, {
    userId,
    model,
    attachmentIds,
    history,
  });
  if (attachments.error) return refuse(attachments.error.status, attachments.error.message);

  // Everything that can fail runs before the Messages are written.
  const adapter = deps.adapterFor(model.id, call.credentials, {
    maxOutputTokens: call.maxOutputTokens,
  });
  const userParts =
    command.text === undefined ? undefined : storedParts([{ type: "text", text: command.text }]);
  const messages = toModelMessages(
    [
      ...history.map((row) => ({
        role: row.role,
        parts: parseStoredParts(row.parts),
        model: row.model,
        attachments: attachments.ofHistory(row),
      })),
      ...(userParts
        ? [{ role: "user" as const, parts: userParts, attachments: attachments.added }]
        : []),
    ],
    {
      provider: model.provider,
      webSearch: searchCredentials !== null,
      reads: { images: model.images, pdfs: model.pdfs },
    },
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
    if (running) return "streaming";
    // Holds the attachments against the orphan cleanup until they're linked.
    if (!(await lockAttachments(tx, userId, attachmentIds))) return "attachment_gone";

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
        // The Run's lease starts now (ADR 0006); the Run's snapshot timer keeps it fresh.
        heartbeatAt: now,
      },
    ]);
    if (userParts) await linkAttachments(tx, userMessageId, attachmentIds);
    await tx
      .update(conversation)
      .set({ activeLeafId: assistantMessageId, lastMessageAt: now, model: model.id })
      .where(eq(conversation.id, owned.id));
    return "started";
  });
  if (started === "streaming") {
    return refuse(409, "A reply is still streaming in this Conversation");
  }
  if (started === "attachment_gone") return refuse(404, "Attachment not found");

  await startRun(deps, {
    messageId: assistantMessageId,
    provider: model.provider,
    adapter,
    messages,
    webSearch: searchCredentials ?? undefined,
    systemPrompts,
    modelOptions: generationOptionsFor(model.id, { maxOutputTokens: model.maxOutputTokens }),
    // A Run on Host credentials is recorded against the user's Quota (ADR 0007).
    meter: call.hostModel ? { userId, model: model.id, price: call.hostModel } : undefined,
  });
  // The response reads the Run's log from the start, like any joiner (ADR 0006).
  return resumeServerSentEventsResponse({
    adapter: runStreamDurability(deps.runStreams, assistantMessageId, START),
  });
}
