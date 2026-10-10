import {
  storedParts,
  storedPartsSchema,
  type StoredPart,
  type ToolCallPart,
} from "../../shared/message-parts";
import { conversation, message } from "../db/schema/chat";
import { and, eq } from "drizzle-orm";

import { attachmentsForSend } from "../attachments/send";
import { resolveModelCall } from "../credentials/resolve";
import type { AppDeps } from "../deps";
import { parseStoredParts, toModelMessages } from "../../shared/chat/parts";
import { resolveModel } from "./available-models";
import { generationOptionsFor } from "./generation";
import { quotaRefusal } from "./quota";
import { approvalPrefix, startRun } from "./run";
import { findMessage, loadPath } from "./store";
import { loadSettings } from "../settings/store";
import { systemPromptsFor } from "./system-prompts";

/** Why a decision didn't start a Run. `started` is the only success. */
export type DecideResult =
  | "started"
  | "not_found"
  | "not_waiting"
  | "streaming"
  | "unavailable"
  | "quota";

/** What a refused call's result says to the Model and the stored part (`denied`). */
export const declinedResult = { error: "User declined tool execution" };

/**
 * Answers the call a reply is waiting on (ADR 0008): starts a new Run on the same Message. The
 * history is rebuilt from the Message tree, with the call stored without a result, so the resumed
 * Run supplies the result: the tool runs when approved, and the Model gets `declinedResult` when not.
 * The Run is the Message's next Run (`runNumber`), with the same Run rules as any other.
 */
export async function decideApproval(
  deps: AppDeps,
  userId: string,
  messageId: string,
  approved: boolean,
): Promise<DecideResult> {
  const owned = await findMessage(deps, userId, messageId);
  if (!owned) return "not_found";
  if (owned.status !== "awaiting_approval") return "not_waiting";
  const stored = storedPartsSchema.safeParse(owned.parts);
  if (!stored.success) return "not_waiting";
  const waiting = stored.data.parts.find(
    (part): part is ToolCallPart => part.type === "tool_call" && part.state === "awaiting_approval",
  );
  if (!waiting || !owned.threadId || !owned.interruptedRunId) return "not_waiting";
  if (!owned.model) return "unavailable";

  const model = await resolveModel(deps, userId, owned.model);
  if (!model) return "unavailable";
  const call = await resolveModelCall(deps, userId, model.id);
  if (!call) return "unavailable";
  // A Run on Host credentials is refused once its Quota's window has spent the budget (ADR 0007).
  if (call.hostModel && (await quotaRefusal(deps, userId))) return "quota";

  const history = await loadPath(deps, owned.conversationId, owned.id);
  const attachments = await attachmentsForSend(deps, {
    userId,
    model,
    attachmentIds: [],
    history,
  });
  if (attachments.error) return "unavailable";
  const hostTools = model.tools ? deps.tools : [];
  const { instructions } = await loadSettings(deps, userId);
  const systemPrompts = systemPromptsFor({ webSearch: false, instructions });
  const messages = toModelMessages(
    history.map((row) => ({
      role: row.role,
      parts: parseStoredParts(row.parts),
      model: row.model,
      attachments: attachments.ofHistory(row),
    })),
    {
      provider: model.provider,
      hostTools: hostTools.length > 0,
      reads: { images: model.images, pdfs: model.pdfs },
    },
  );
  const adapter = deps.adapterFor(model.id, call.credentials, {
    maxOutputTokens: call.maxOutputTokens,
  });

  const runNumber = owned.runNumber + 1;
  const decided = storedParts(
    stored.data.parts.map((part: StoredPart) =>
      part === waiting
        ? approved
          ? { ...part, state: "running" as const }
          : { ...part, state: "denied" as const, result: declinedResult }
        : part,
    ),
  );
  const claimed = await deps.db.transaction(async (tx) => {
    // The same lock a send takes: one Run per Conversation (ADR 0002).
    await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(eq(conversation.id, owned.conversationId))
      .for("update");
    const [running] = await tx
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.conversationId, owned.conversationId), eq(message.status, "streaming")))
      .limit(1);
    if (running) return "streaming";
    const [row] = await tx
      .update(message)
      .set({
        status: "streaming",
        parts: decided,
        runNumber,
        heartbeatAt: new Date(),
        cancelRequestedAt: null,
      })
      .where(and(eq(message.id, owned.id), eq(message.status, "awaiting_approval")))
      .returning({ id: message.id });
    return row ? "claimed" : "not_waiting";
  });
  if (claimed !== "claimed") return claimed;

  await startRun(deps, {
    messageId: owned.id,
    runNumber,
    initialParts: decided.parts,
    resume: {
      threadId: owned.threadId,
      parentRunId: owned.interruptedRunId,
      interruptId: `${approvalPrefix}${waiting.toolCallId}`,
      approved,
    },
    provider: model.provider,
    adapter,
    messages,
    hostTools,
    context: { userId, conversationId: owned.conversationId },
    systemPrompts,
    modelOptions: generationOptionsFor(model.id, {
      maxOutputTokens: model.maxOutputTokens,
      effort: owned.reasoningEffort ?? undefined,
    }),
    meter: call.hostModel ? { userId, model: model.id, price: call.hostModel } : undefined,
  });
  return "started";
}
