import {
  type StoredPart,
  type StoredParts,
  storedParts,
  storedPartsSchema,
} from "@ai-chat/db/message-parts";
import {
  type ContentPart,
  EventType,
  type MessagePart,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";

import { attachmentKind, kindLabel, kindLabelPlural } from "../attachments/kinds";
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
  /** The files a user Message carries, in order (attachments are never parts, ADR 0001). */
  attachments?: StoredAttachment[];
};

export type StoredAttachment = { filename: string; mediaType: string; bytes: Uint8Array };

/** What the Model reads besides text. */
export type ModelReads = { images: boolean; pdfs: boolean };

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
  {
    provider,
    reads = { images: false, pdfs: false },
  }: {
    provider?: string;
    /** Attachments the Model can't read become text placeholders. */
    reads?: ModelReads;
  } = {},
): ModelMessage[] {
  return history.flatMap(({ role, parts, model, attachments = [] }) => {
    const text = textOf(parts, "");
    if (!text) return [];
    const content: ModelMessage["content"] =
      attachments.length > 0
        ? [
            ...attachments.map((file) => attachmentPart(file, reads)),
            { type: "text", content: text },
          ]
        : text;
    const sameProvider = provider !== undefined && model && providerOf(model) === provider;
    const thinking = sameProvider
      ? parts.parts
          .filter((part) => part.type === "thinking")
          .map(({ text, signature, redacted }) => ({ content: text, signature, redacted }))
      : [];
    return [{ role, content, ...(thinking.length > 0 && { thinking }) }];
  });
}

/**
 * An attachment as the Provider gets it: images and PDFs as inline base64 when the Model reads
 * them, text files as fenced text, anything else as a short placeholder.
 */
function attachmentPart(
  { filename, mediaType, bytes }: StoredAttachment,
  reads: ModelReads,
): ContentPart {
  const kind = attachmentKind(mediaType, filename);
  const source = { type: "data" as const, value: toBase64(bytes), mimeType: mediaType };
  if (kind === "image" && reads.images) return { type: "image", source };
  if (kind === "pdf" && reads.pdfs) return { type: "document", source, metadata: { filename } };
  if (kind === "text") {
    const fileText = new TextDecoder().decode(bytes);
    const longestRun = Math.max(0, ...(fileText.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return { type: "text", content: `${filename}\n${fence}\n${fileText}\n${fence}` };
  }
  const [label, plural] = kind ? [kindLabel(kind), kindLabelPlural(kind)] : ["file", "files"];
  return {
    type: "text",
    content: `[Attached ${label} "${filename}" left out: this Model can't read ${plural}]`,
  };
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
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
