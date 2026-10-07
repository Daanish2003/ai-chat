import {
  type StoredPart,
  type StoredParts,
  storedParts,
  storedPartsSchema,
} from "@ai-chat/db/message-parts";
import { EventType, type MessagePart, type ModelMessage, type StreamChunk } from "@tanstack/ai";

import { providerOf } from "./models";

/**
 * The one boundary between stored Message parts (our versioned zod shape, ADR 0001) and
 * TanStack AI. A TanStack AI upgrade only needs this module checked.
 */

export type StoredMessage = {
  role: "user" | "assistant";
  parts: StoredParts;
  /** `"provider:model"` of the Model that wrote an assistant Message. */
  model?: string | null;
};

/** Validates parts read from the database. Throws on an unknown schema version or part. */
export function parseStoredParts(json: unknown): StoredParts {
  return storedPartsSchema.parse(json);
}

type ThinkingPart = Extract<StoredPart, { type: "thinking" }>;

/**
 * TanStack AI marks a redacted thinking block (Anthropic `redacted_thinking`) by this reasoning
 * message id prefix; it doesn't export the check.
 */
const redactedThinkingIdPrefix = "redacted_thinking-";

/** Collects a run's stream chunks into stored parts. */
export function createPartsBuilder() {
  const parts: StoredPart[] = [];
  let textMessageId: string | undefined;
  // Thinking by reasoning message id: its signature arrives after its text.
  const thinking = new Map<string, ThinkingPart>();
  const thinkingPart = (messageId: string) => {
    let part = thinking.get(messageId);
    if (!part) {
      part = { type: "thinking", text: "" };
      if (messageId.startsWith(redactedThinkingIdPrefix)) part.redacted = true;
      thinking.set(messageId, part);
      parts.push(part);
    }
    return part;
  };

  return {
    add(chunk: StreamChunk) {
      if (chunk.type === EventType.REASONING_MESSAGE_CONTENT && chunk.delta) {
        thinkingPart(chunk.messageId).text += chunk.delta;
        return;
      }
      if (
        chunk.type === EventType.REASONING_ENCRYPTED_VALUE &&
        chunk.subtype === "message" &&
        chunk.encryptedValue
      ) {
        thinkingPart(chunk.entityId).signature = chunk.encryptedValue;
        return;
      }
      if (chunk.type !== EventType.TEXT_MESSAGE_CONTENT || !chunk.delta) return;
      const last = parts.at(-1);
      if (last?.type === "text" && chunk.messageId === textMessageId) {
        last.text += chunk.delta;
      } else {
        parts.push({ type: "text", text: chunk.delta });
        textMessageId = chunk.messageId;
      }
    },
    /** A copy of the parts so far. */
    parts(): StoredParts {
      return storedParts(parts.map((part) => ({ ...part })));
    },
  };
}

function textOf(parts: StoredParts, separator: string) {
  return parts.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(separator);
}

/**
 * Provider history for `provider`, oldest first. Messages without any text are left out.
 * Thinking goes back only to the Provider that wrote it; another Provider can't read it.
 */
export function toModelMessages(
  history: StoredMessage[],
  { provider }: { provider?: string } = {},
): ModelMessage[] {
  return history.flatMap(({ role, parts, model }) => {
    const content = textOf(parts, "");
    if (!content) return [];
    const sameProvider = provider !== undefined && model && providerOf(model) === provider;
    const thinking = sameProvider
      ? parts.parts
          .filter((part) => part.type === "thinking")
          .map(({ text, signature, redacted }) => ({ content: text, signature, redacted }))
      : [];
    return [{ role, content, ...(thinking.length > 0 && { thinking }) }];
  });
}

/** `UIMessage` parts for `useChat`. */
export function toUIParts(parts: StoredParts): MessagePart[] {
  return parts.parts.map((part): MessagePart => {
    // The signature is only for the Provider; the client never needs it.
    if (part.type === "thinking") return { type: "thinking", content: part.text };
    return { type: "text", content: part.text };
  });
}

/** The plain text `message.searchText` holds: the text parts only. */
export function searchTextOf(parts: StoredParts): string {
  return textOf(parts, "\n");
}
