import {
  type StoredPart,
  type StoredParts,
  storedParts,
  storedPartsSchema,
} from "@ai-chat/db/message-parts";
import { EventType, type MessagePart, type ModelMessage, type StreamChunk } from "@tanstack/ai";

/**
 * The one boundary between stored Message parts (our versioned zod shape, ADR 0001) and
 * TanStack AI. A TanStack AI upgrade only needs this module checked.
 */

export type StoredMessage = { role: "user" | "assistant"; parts: StoredParts };

/** Validates parts read from the database. Throws on an unknown schema version or part. */
export function parseStoredParts(json: unknown): StoredParts {
  return storedPartsSchema.parse(json);
}

/** Collects a run's stream chunks into stored parts. */
export function createPartsBuilder() {
  const parts: StoredPart[] = [];
  let textMessageId: string | undefined;

  return {
    add(chunk: StreamChunk) {
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

/** Provider history, oldest first. Messages without any text are left out. */
export function toModelMessages(history: StoredMessage[]): ModelMessage[] {
  return history.flatMap(({ role, parts }) => {
    const content = textOf(parts, "");
    return content ? [{ role, content }] : [];
  });
}

/** `UIMessage` parts for `useChat`. */
export function toUIParts(parts: StoredParts): MessagePart[] {
  return parts.parts.map((part) => ({ type: "text", content: part.text }));
}

/** The plain text `message.searchText` holds: the text parts only. */
export function searchTextOf(parts: StoredParts): string {
  return textOf(parts, "\n");
}
