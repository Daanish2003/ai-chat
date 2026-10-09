import type { AttachmentInfo } from "@ai-chat/api/shared/attachments/kinds";
import type { SiblingPosition } from "@ai-chat/api/shared/chat/branches";
import type { ActiveBranchMessage, ClientMessage } from "@ai-chat/api/shared/chat/client-message";
import type { SharedConversation } from "@ai-chat/api/shared/share/conversation";
import type { UIMessage } from "@tanstack/ai-client";

/** What the server knows about a Message beyond its parts, kept in `UIMessage.metadata`. */
export type MessageInfo = Pick<ClientMessage, "model" | "status" | "error" | "errorReason">;

/**
 * An attachment as a chip. A Shared link shows only its filename and type; the user's own
 * Messages also have its id and size.
 */
export type AttachmentChip = Pick<AttachmentInfo, "filename" | "mediaType"> &
  Partial<Pick<AttachmentInfo, "id" | "size">>;

/** `useChat` messages from the Active Branch (`conversation.get`). */
export function toUIMessages(messages: ActiveBranchMessage[]): UIMessage[] {
  return messages.map(
    ({ id, role, parts, createdAt, model, status, error, errorReason, siblings, attachments }) => ({
      id,
      role,
      parts: parts as UIMessage["parts"],
      createdAt,
      metadata: {
        model,
        status,
        error,
        errorReason,
        siblings,
        attachments,
      } satisfies MessageInfo & {
        siblings: SiblingPosition;
        attachments: AttachmentChip[];
      },
    }),
  );
}

/** A Shared link's Messages, for read-only `MessageRow`s. */
export function sharedToUIMessages(messages: SharedConversation["messages"]): UIMessage[] {
  return messages.map(({ id, role, parts, attachments, createdAt, model, status }) => ({
    id,
    role,
    parts: parts as UIMessage["parts"],
    createdAt,
    metadata: {
      model,
      status,
      error: null,
      errorReason: null,
      attachments,
    } satisfies MessageInfo & {
      attachments: AttachmentChip[];
    },
  }));
}

/** The files a Message carries, kept in `UIMessage.metadata`; none for a reply. */
export function messageAttachments(message: UIMessage): AttachmentChip[] {
  const info = message.metadata as { attachments?: AttachmentChip[] } | undefined;
  return info?.attachments ?? [];
}

/** Where the Message sits among its siblings, for the ‹ n/m › arrows; 1 of 1 while it streams. */
export function messageSiblings(message: UIMessage): SiblingPosition {
  const info = message.metadata as { siblings?: SiblingPosition } | undefined;
  return info?.siblings ?? { index: 0, count: 1, previousId: null, nextId: null };
}

/**
 * Editing or regenerating `messageId` starts a new Branch beside it: the command goes under the
 * same parent, and the messages shown before it stay while the new reply streams.
 */
export function branchFrom<T extends { id: string }>(messages: T[], messageId: string) {
  const history = messages.slice(
    0,
    messages.findIndex((message) => message.id === messageId),
  );
  return { parentId: history.at(-1)?.id ?? null, history };
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

/** What to tell the user about a Message that ended in `error`, and whether to link Key settings. */
export function describeError({ error, errorReason }: MessageInfo) {
  switch (errorReason) {
    case "invalid_key":
      return { text: "The Provider rejected your API key.", keySettings: true };
    case "rate_limited":
      return {
        text: "The Provider rate limited this request. Try again in a moment.",
        keySettings: false,
      };
    case "provider_error":
      return {
        text: error
          ? `The Provider returned an error: ${error}`
          : "The Provider returned an error.",
        keySettings: false,
      };
  }
  // Errors with no reason are the run's own guards (ADR 0002).
  const text =
    error === "timed out"
      ? "The reply took too long and timed out."
      : error === "interrupted"
        ? "The reply was interrupted by a server restart."
        : (error ?? "Something went wrong.");
  return { text, keySettings: false };
}

/**
 * The first Message of a new Conversation, typed before it existed: the new Conversation
 * page creates it, navigates to `/c/$id`, and that page sends it.
 */
type PendingFirstMessage = { text: string; attachments: AttachmentInfo[] };

const pendingFirstMessages = new Map<string, PendingFirstMessage>();

export function setPendingFirstMessage(conversationId: string, pending: PendingFirstMessage) {
  pendingFirstMessages.set(conversationId, pending);
}

/** The pending first Message, handed out once. */
export function takePendingFirstMessage(conversationId: string) {
  const pending = pendingFirstMessages.get(conversationId);
  pendingFirstMessages.delete(conversationId);
  return pending;
}
