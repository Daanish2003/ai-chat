import { curatedModels } from "@ai-chat/api/chat/models";
import type { ClientMessage } from "@ai-chat/api/chat/store";
import type { CredentialSummary } from "@ai-chat/api/credentials/store";
import type { UIMessage } from "@tanstack/ai-react";

/** What the server knows about a Message beyond its parts, kept in `UIMessage.metadata`. */
export type MessageInfo = Pick<ClientMessage, "model" | "status" | "error" | "errorReason">;

/** `useChat` messages from the Active Branch (`conversation.get`). */
export function toUIMessages(messages: ClientMessage[]): UIMessage[] {
  return messages.map(({ id, role, parts, createdAt, model, status, error, errorReason }) => ({
    id,
    role,
    parts: parts as UIMessage["parts"],
    createdAt,
    metadata: { model, status, error, errorReason } satisfies MessageInfo,
  }));
}

/**
 * The server's view of a Message. A message `useChat` is streaming has none yet, so it counts as
 * `streaming` until the run ends and the Active Branch is refetched.
 */
export function messageInfo(message: UIMessage): MessageInfo {
  const info = message.metadata as Partial<MessageInfo> | undefined;
  return {
    model: info?.model ?? null,
    status: info?.status ?? "streaming",
    error: info?.error ?? null,
    errorReason: info?.errorReason ?? null,
  };
}

/** The curated Models of the Providers the user has credentials for. */
export function availableModels(credentials: CredentialSummary[]) {
  const services = new Set(credentials.map((credential) => credential.service));
  return curatedModels.filter((model) => services.has(model.provider));
}

/**
 * The first Message of a new Conversation, typed before it existed: the new Conversation
 * page creates it, navigates to `/c/$id`, and that page sends it.
 */
const pendingFirstMessages = new Map<string, string>();

export function setPendingFirstMessage(conversationId: string, text: string) {
  pendingFirstMessages.set(conversationId, text);
}

/** The pending first Message, handed out once. */
export function takePendingFirstMessage(conversationId: string) {
  const text = pendingFirstMessages.get(conversationId);
  pendingFirstMessages.delete(conversationId);
  return text;
}
