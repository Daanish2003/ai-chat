import type { SearchErrorReason, SearchResult } from "../deps";

/**
 * The `web_search` tool's contract, shared by the server tool, the parts boundary and the web
 * app. Plain data: safe to import into the browser.
 */

export const webSearchToolName = "web_search";

/** Searches one reply may make; the next call gets `searchLimitError` instead. */
export const maxSearchesPerReply = 3;

export const searchLimitError = "search limit reached";

/** What the Model reads (and the web app shows) when a search fails. */
export const searchErrorMessages: Record<SearchErrorReason, string> = {
  invalid_key: "Tavily rejected the API key",
  quota_exhausted: "Tavily's monthly quota is used up",
  failed: "The web search failed",
};

/** The `web_search` tool result the Model sees. */
export type WebSearchOutput = { results: SearchResult[] } | { error: string };
