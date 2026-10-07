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
import { searchErrorMessages, type WebSearchOutput, webSearchToolName } from "./web-search";

/**
 * The one boundary between stored Message parts (our versioned zod shape, ADR 0001) and
 * TanStack AI. A TanStack AI upgrade only needs this module checked.
 */

export type StoredMessage = { role: "user" | "assistant"; parts: StoredParts };

/** Validates parts read from the database. Throws on an unknown schema version or part. */
export function parseStoredParts(json: unknown): StoredParts {
  return storedPartsSchema.parse(json);
}

/** How a search ended: its results, or why it failed. */
export type SearchOutcome = { results: SearchResult[] } | { errorReason: SearchErrorReason };

/**
 * Collects a run's stream chunks into stored parts. The `web_search` tool records its searches
 * here as it runs them, so they land between the text before and after them.
 */
export function createPartsBuilder() {
  const parts: StoredPart[] = [];
  let textMessageId: string | undefined;
  const runningSearch = (toolCallId: string) =>
    parts.find(
      (part): part is WebSearchPart =>
        part.type === "web_search" && part.toolCallId === toolCallId && part.state === "running",
    );

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
    } else if (finished(part)) {
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
    } else if (finished(part)) {
      pieces.push(searchPlaceholder(part));
      lastWasText = false;
    }
  }
  const content = pieces.filter(Boolean).join("\n\n");
  return content ? [{ role, content }] : [];
}

/**
 * Provider history, oldest first. Messages without any text are left out. Stored searches
 * replay as `web_search` tool calls when this request offers the tool, else as short text
 * placeholders (a Model without tools, or Search off). Stored history is never rewritten.
 */
export function toModelMessages(
  history: StoredMessage[],
  { webSearch = false }: { webSearch?: boolean } = {},
): ModelMessage[] {
  return history.flatMap(webSearch ? withToolCalls : withPlaceholders);
}

/** `UIMessage` parts for `useChat`. A search is a `web_search` tool call, as it streams. */
export function toUIParts(parts: StoredParts): MessagePart[] {
  return parts.parts.map((part): MessagePart => {
    if (part.type === "text") return { type: "text", content: part.text };
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
