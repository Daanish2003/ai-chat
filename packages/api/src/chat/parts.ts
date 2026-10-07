import {
  type StoredPart,
  type StoredParts,
  storedParts,
  storedPartsSchema,
  type WebSearchPart,
} from "@ai-chat/db/message-parts";
import {
  EventType,
  type MessagePart,
  type ModelMessage,
  type StreamChunk,
  type ToolCall,
} from "@tanstack/ai";

import type { SearchErrorReason, SearchResult } from "../deps";
import { providerOf } from "./models";
import { searchErrorMessages, type WebSearchOutput, webSearchToolName } from "./web-search";

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

/** How a search ended: its results, or why it failed. */
export type SearchOutcome = { results: SearchResult[] } | { errorReason: SearchErrorReason };

/**
 * Collects a run's stream chunks into stored parts. The `web_search` tool records its searches
 * here as it runs them, so they land between the text before and after them.
 */
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
  const runningSearch = (toolCallId: string) =>
    parts.find(
      (part): part is WebSearchPart =>
        part.type === "web_search" && part.toolCallId === toolCallId && part.state === "running",
    );

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
    startSearch(toolCallId: string, query: string) {
      parts.push({ type: "web_search", toolCallId, query, state: "running", results: [] });
    },
    /** Ends a running search. A search that was cancelled meanwhile stays cancelled. */
    finishSearch(toolCallId: string, outcome: SearchOutcome) {
      const part = runningSearch(toolCallId);
      if (!part) return;
      if ("results" in outcome) {
        part.state = "done";
        part.results = outcome.results;
      } else {
        part.state = "error";
        part.errorReason = outcome.errorReason;
      }
    },
    cancelRunningSearches() {
      for (const part of parts) {
        if (part.type === "web_search" && part.state === "running") part.state = "cancelled";
      }
    },
    /** A copy of the parts so far. */
    parts(): StoredParts {
      return storedParts(parts.map((part) => ({ ...part })));
    },
  };
}

/** The parts with every `running` search closed as `cancelled`, for a run that ended. */
export function cancelRunningSearches(parts: StoredParts): StoredParts {
  return storedParts(
    parts.parts.map((part) =>
      part.type === "web_search" && part.state === "running"
        ? { ...part, state: "cancelled" }
        : part,
    ),
  );
}

function textOf(parts: StoredParts, separator: string) {
  return parts.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(separator);
}

const finished = (part: WebSearchPart) => part.state === "done" || part.state === "error";

/** What the Model read as the result of a finished search. */
function searchOutput(part: WebSearchPart): WebSearchOutput {
  if (part.state !== "error") return { results: part.results };
  const reason = part.errorReason ?? "failed";
  return { error: searchErrorMessages[reason], reason };
}

/** A finished search as text, for a request that doesn't offer the `web_search` tool. */
function searchPlaceholder(part: WebSearchPart) {
  const found =
    part.state === "error"
      ? "the search failed"
      : part.results.length === 0
        ? "no results"
        : part.results.map((result) => `${result.title} (${result.url})`).join(", ");
  return `[Searched the web for "${part.query}": ${found}]`;
}

/** A Message as the Model sees it when the `web_search` tool is offered: searches as tool calls. */
function withToolCalls({ role, parts }: StoredMessage): ModelMessage[] {
  const messages: ModelMessage[] = [];
  let content = "";
  let searches: WebSearchPart[] = [];
  const flush = () => {
    if (searches.length > 0) {
      const toolCalls: ToolCall[] = searches.map((search) => ({
        id: search.toolCallId,
        type: "function",
        function: { name: webSearchToolName, arguments: JSON.stringify({ query: search.query }) },
      }));
      messages.push({ role, content: content || null, toolCalls });
      for (const search of searches) {
        messages.push({
          role: "tool",
          toolCallId: search.toolCallId,
          content: JSON.stringify(searchOutput(search)),
        });
      }
    } else if (content) {
      messages.push({ role, content });
    }
    content = "";
    searches = [];
  };

  for (const part of parts.parts) {
    if (part.type === "text") {
      if (searches.length > 0) flush();
      content += part.text;
    } else if (part.type === "web_search" && finished(part)) {
      // A search without a result (running, cancelled) is an unmatched tool call: left out.
      searches.push(part);
    }
  }
  flush();
  return messages;
}

/** A Message as the Model sees it without the `web_search` tool: searches as text placeholders. */
function withPlaceholders({ role, parts }: StoredMessage): ModelMessage[] {
  const pieces: string[] = [];
  let lastWasText = false;
  for (const part of parts.parts) {
    if (part.type === "text") {
      if (lastWasText) pieces[pieces.length - 1] += part.text;
      else pieces.push(part.text);
      lastWasText = true;
    } else if (part.type === "web_search" && finished(part)) {
      pieces.push(searchPlaceholder(part));
      lastWasText = false;
    }
  }
  const content = pieces.filter(Boolean).join("\n\n");
  return content ? [{ role, content }] : [];
}

/**
 * Provider history for `provider`, oldest first. Messages without any text are left out.
 * Thinking goes back only to the Provider that wrote it (on the Message's first turn); another
 * Provider can't read it. Stored searches replay as `web_search` tool calls when this request
 * offers the tool (`webSearch`), else as short text placeholders (a Model without tools, or
 * Search off). Stored history is never rewritten.
 */
export function toModelMessages(
  history: StoredMessage[],
  { provider, webSearch = false }: { provider?: string; webSearch?: boolean } = {},
): ModelMessage[] {
  return history.flatMap((stored) => {
    const messages = webSearch ? withToolCalls(stored) : withPlaceholders(stored);
    const [first] = messages;
    if (!first) return [];
    const { parts, model } = stored;
    const sameProvider = provider !== undefined && model && providerOf(model) === provider;
    const thinking = sameProvider
      ? parts.parts
          .filter((part) => part.type === "thinking")
          .map(({ text, signature, redacted }) => ({ content: text, signature, redacted }))
      : [];
    if (thinking.length > 0) messages[0] = { ...first, thinking };
    return messages;
  });
}

/** `UIMessage` parts for `useChat`. A search is a `web_search` tool call, as it streams. */
export function toUIParts(parts: StoredParts): MessagePart[] {
  return parts.parts.map((part): MessagePart => {
    if (part.type === "text") return { type: "text", content: part.text };
    // The signature is only for the Provider; the client never needs it.
    if (part.type === "thinking") return { type: "thinking", content: part.text };
    const input = { query: part.query };
    return {
      type: "tool-call",
      id: part.toolCallId,
      name: webSearchToolName,
      arguments: JSON.stringify(input),
      input,
      // A cancelled search ended without a result.
      state:
        part.state === "running"
          ? "input-complete"
          : part.state === "cancelled"
            ? "error"
            : "complete",
      ...(finished(part) && { output: searchOutput(part) }),
    };
  });
}

/** The plain text `message.searchText` holds: the text parts only. */
export function searchTextOf(parts: StoredParts): string {
  return textOf(parts, "\n");
}
