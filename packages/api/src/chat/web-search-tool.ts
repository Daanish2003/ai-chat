import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { type Credentials, type SearchClient, SearchError } from "../deps";
import type { createPartsBuilder } from "./parts";
import {
  maxSearchesPerReply,
  searchErrorMessages,
  searchLimitError,
  type WebSearchOutput,
  webSearchToolName,
} from "./web-search";

const webSearchDefinition = toolDefinition({
  name: webSearchToolName,
  description:
    "Search the web for current information. Returns up to 5 results with title, url and a " +
    `snippet. Use it only when the answer needs fresh or specific facts; at most ${maxSearchesPerReply} searches per reply.`,
  inputSchema: z.object({
    query: z.string().min(1).meta({ description: "What to search the web for" }),
  }),
});

/**
 * The `web_search` server tool for one reply: it searches through `searchClient` with the user's
 * Tavily Tool credential and records each search in the reply's `parts`, calling `onChange` when
 * they change. Failures become the search's error state and an `{ error }` result, so the reply
 * continues. After `maxSearchesPerReply` searches, a call gets `searchLimitError` and searches nothing.
 */
export function createWebSearchTool({
  searchClient,
  credentials,
  parts,
  onChange,
}: {
  searchClient: SearchClient;
  credentials: Credentials;
  parts: ReturnType<typeof createPartsBuilder>;
  onChange: () => void;
}) {
  let searches = 0;
  return webSearchDefinition.server(async ({ query }, context): Promise<WebSearchOutput> => {
    if (searches >= maxSearchesPerReply) return { error: searchLimitError };
    searches++;
    const toolCallId = context?.toolCallId ?? `${webSearchToolName}-${searches}`;
    parts.startSearch(toolCallId, query);
    onChange();
    try {
      const results = await searchClient.search(query, credentials, {
        signal: context?.abortSignal,
      });
      parts.finishSearch(toolCallId, { results });
      return { results };
    } catch (caught) {
      // A search cut off by the run ending stays running; the run closes it as cancelled.
      if (context?.abortSignal?.aborted) throw caught;
      const errorReason = caught instanceof SearchError ? caught.reason : "failed";
      parts.finishSearch(toolCallId, { errorReason });
      return { error: searchErrorMessages[errorReason] };
    } finally {
      onChange();
    }
  });
}
