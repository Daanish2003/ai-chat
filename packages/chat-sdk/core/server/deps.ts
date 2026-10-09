import type { Database } from "./db/index";
import type { AnyTextAdapter } from "@tanstack/ai";

import { adapterFor } from "./chat/adapters";
import type { PubSub } from "./chat/pubsub";
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
  /** A streaming Message whose heartbeat is older than this is reaped (ADR 0006). */
  leaseMs: number;
  /** How often the reaper runs once `start()` has been called. */
  reapIntervalMs: number;
  /** How long `stop()` lets local Runs finish before it ends them. */
  drainMs: number;
};

/** Everything the server entry points need from the outside world, built once at server start. */
export type AppDeps = {
  db: Database;
  /** Builds the TanStack AI text adapter for a `"provider:model"` id. */
  adapterFor: (model: string, credentials: Credentials) => AnyTextAdapter;
  searchClient: SearchClient;
  /** Every Run's chunk log, which its POST response and any joiner read (ADR 0006). */
  runStreams: RunStreams;
  /** Control signals such as Stop, which a Run's owner subscribes to (ADR 0006). */
  pubsub: PubSub;
  limits: Limits;
  /**
   * Set by `stop()`: once `stopping`, a new Run is refused with 503. `runs` holds this process's
   * live Runs by Message id, so `stop()` can drain them; Stop itself goes through `pubsub`.
   */
  lifecycle: { stopping: boolean; runs: Map<string, AbortController> };
  fetch: typeof fetch;
  /** `KEY_ENCRYPTION_SECRET`: encrypts Provider credentials and Tool credentials at rest (ADR 0003). */
  keyEncryptionSecret: string;
};

export const defaultLimits: Limits = {
  snapshotIntervalMs: 1_000,
  runCapMs: 5 * 60_000,
  leaseMs: 30_000,
  reapIntervalMs: 30_000,
  drainMs: 250_000,
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
    runStreams: runtime.runStreams,
    pubsub: runtime.pubsub,
    limits: defaultLimits,
    lifecycle: { stopping: false, runs: new Map() },
    fetch: globalThis.fetch,
    keyEncryptionSecret,
  };
}
