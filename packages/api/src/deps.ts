import type { Database } from "@ai-chat/db";
import type { AnyTextAdapter } from "@tanstack/ai";

/** Decrypted Provider credentials or Tool credential fields, keyed by field name. */
export type Credentials = Record<string, string>;

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
};

export type SearchErrorReason = "invalid_key" | "quota_exhausted" | "failed";

export class SearchError extends Error {
  readonly reason: SearchErrorReason;

  constructor(reason: SearchErrorReason, message: string = `Web search failed: ${reason}`) {
    super(message);
    this.name = "SearchError";
    this.reason = reason;
  }
}

/** Web search backend for the `web_search` tool. Failures throw a `SearchError`. */
export type SearchClient = {
  search: (query: string, credentials: Credentials) => Promise<SearchResult[]>;
};

export type Limits = {
  /** Least time between two snapshots of a streaming Message. */
  snapshotIntervalMs: number;
  /** Longest a run may take before it is saved as timed out. */
  runCapMs: number;
};

/** Everything the server entry points need from the outside world, built once at server start. */
export type AppDeps = {
  db: Database;
  /** Builds the TanStack AI text adapter for a `"provider:model"` id. */
  adapterFor: (model: string, credentials: Credentials) => AnyTextAdapter;
  searchClient: SearchClient;
  /** In-process abort registry of runs, keyed by the streaming assistant Message id. */
  runs: Map<string, AbortController>;
  limits: Limits;
  fetch: typeof fetch;
};

export const defaultLimits: Limits = {
  snapshotIntervalMs: 1_000,
  runCapMs: 5 * 60_000,
};

/** The production `AppDeps`. Providers and web search are wired in by later features. */
export function createAppDeps({ db }: { db: Database }): AppDeps {
  return {
    db,
    adapterFor: (model) => {
      throw new Error(`No adapter is available for model "${model}"`);
    },
    searchClient: {
      search: async () => {
        throw new SearchError("failed", "Web search is not available");
      },
    },
    runs: new Map(),
    limits: defaultLimits,
    fetch: globalThis.fetch,
  };
}
