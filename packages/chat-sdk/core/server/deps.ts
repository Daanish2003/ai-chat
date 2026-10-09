import type { Database } from "./db/index";
import type { AnyTextAdapter } from "@tanstack/ai";

import { adapterFor } from "./chat/adapters";
import type { RunStreams } from "./chat/run-streams";
import { createTavilyClient } from "./chat/tavily";
import type { SearchErrorReason, SearchResult } from "../shared/chat/web-search";
import type { ChatRuntime } from "./runtime";

export type { SearchErrorReason, SearchResult };

/** Decrypted Provider credentials or Tool credential fields, keyed by field name. */
export type Credentials = Record<string, string>;

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
  search: (
    query: string,
    credentials: Credentials,
    options?: { signal?: AbortSignal },
  ) => Promise<SearchResult[]>;
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
  /** Every Run's chunk log, which its POST response and any joiner read (ADR 0006). */
  runStreams: RunStreams;
  limits: Limits;
  fetch: typeof fetch;
  /** `KEY_ENCRYPTION_SECRET`: encrypts Provider credentials and Tool credentials at rest (ADR 0003). */
  keyEncryptionSecret: string;
};

export const defaultLimits: Limits = {
  snapshotIntervalMs: 1_000,
  runCapMs: 5 * 60_000,
};

/** The production `AppDeps`. */
export function createAppDeps({
  db,
  keyEncryptionSecret,
  runtime,
}: {
  db: Database;
  keyEncryptionSecret: string;
  runtime: ChatRuntime;
}): AppDeps {
  return {
    db,
    adapterFor,
    searchClient: createTavilyClient(globalThis.fetch),
    runs: new Map(),
    runStreams: runtime.runStreams,
    limits: defaultLimits,
    fetch: globalThis.fetch,
    keyEncryptionSecret,
  };
}
