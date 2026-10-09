import { storedPartsSchema } from "../../shared/message-parts";
import { message } from "../db/schema/chat";
import {
  type AnyTextAdapter,
  chat,
  EventType,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import { and, eq, isNull, lt, or } from "drizzle-orm";

import type { AppDeps, Credentials } from "../deps";
import { citationPrompt } from "../../shared/chat/citations";
import { cancelRunningSearches, createPartsBuilder, searchTextOf } from "../../shared/chat/parts";
import { titleConversation } from "./title";
import { createWebSearchTool } from "./web-search-tool";

type MessageUpdate = Partial<typeof message.$inferInsert>;
type MessageErrorReason = NonNullable<MessageUpdate["errorReason"]>;
type ProviderError = { message: string; code?: string };

/**
 * Runs one assistant Message (ADR 0002). The run drains `chat()` to the end on its own,
 * whether or not anyone reads the returned chunks: it snapshots the streaming Message's parts
 * every `deps.limits.snapshotIntervalMs`, and finishes the row in `finally`. It is registered in
 * `deps.runs` under the Message id until it ends; aborting that controller stops it.
 *
 * Every chunk goes to the Run's log before anyone reads it (ADR 0006). The POST response and any
 * joiner read that log, so a reader that goes away only stops reading.
 */
export async function startRun(
  deps: AppDeps,
  {
    messageId,
    adapter,
    messages,
    webSearch,
  }: {
    messageId: string;
    adapter: AnyTextAdapter;
    messages: ModelMessage[];
    /** The user's Tavily Tool credential, when this reply offers the `web_search` tool. */
    webSearch?: Credentials;
  },
): Promise<void> {
  const abortController = new AbortController();
  deps.runs.set(messageId, abortController);

  await deps.runStreams.open(messageId);
  const parts = createPartsBuilder();

  let writes = Promise.resolve();
  const write = (fields: MessageUpdate) => {
    writes = writes
      .then(async () => {
        await deps.db.update(message).set(fields).where(eq(message.id, messageId));
      })
      .catch((error: unknown) => console.error(`Saving Message ${messageId} failed`, error));
    return writes;
  };
  const withParts = (fields: MessageUpdate = {}): MessageUpdate => {
    const snapshot = parts.parts();
    return { parts: snapshot, searchText: searchTextOf(snapshot), ...fields };
  };

  let changed = false;
  const snapshotTimer = setInterval(() => {
    // Every tick writes the heartbeat, even when nothing changed: it is the Run's lease (ADR 0006).
    const heartbeat = { heartbeatAt: new Date() };
    void write(changed ? withParts(heartbeat) : heartbeat);
    changed = false;
  }, deps.limits.snapshotIntervalMs);

  /** Whether the log already holds its own RUN_FINISHED or RUN_ERROR. */
  let logEnded = false;
  let ids: { threadId: string; runId: string } | undefined;
  let timedOut = false;
  const capTimer = setTimeout(() => {
    // A run that was stopped but hasn't ended yet stays stopped.
    if (abortController.signal.aborted) return;
    timedOut = true;
    abortController.abort();
  }, deps.limits.runCapMs);

  void (async () => {
    let error: ProviderError | undefined;
    try {
      const tools = webSearch && [
        createWebSearchTool({
          searchClient: deps.searchClient,
          credentials: webSearch,
          parts,
          onChange: () => (changed = true),
        }),
      ];
      // A reply that may search is asked to cite its Sources with markdown links.
      const stream = chat({
        adapter,
        messages,
        abortController,
        ...(tools && { tools, systemPrompts: [citationPrompt] }),
      });
      for await (const chunk of untilAborted(stream, abortController.signal)) {
        parts.add(chunk);
        changed = true;
        if (chunk.type === EventType.RUN_ERROR) {
          error = { message: chunk.message, code: chunk.code ?? chunk.error?.code };
        }
        if (chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR) {
          logEnded = true;
        }
        ids ??= runIdsOf(chunk);
        void deps.runStreams
          .append(messageId, chunk)
          .catch((error: unknown) => console.error(`Logging Message ${messageId} failed`, error));
      }
    } catch (caught) {
      error = thrownError(caught);
    } finally {
      clearInterval(snapshotTimer);
      clearTimeout(capTimer);
      parts.cancelRunningSearches();
      const interrupted = abortController.signal.reason === shutdownAbort;
      await write(
        withParts(
          timedOut
            ? { status: "error", error: "timed out" }
            : interrupted
              ? { status: "error", error: "interrupted" }
              : abortController.signal.aborted
                ? { status: "stopped" }
                : error !== undefined
                  ? {
                      status: "error",
                      error: error.message,
                      errorReason: errorReasonOf(error.code),
                    }
                  : { status: "complete" },
        ),
      );
      deps.runs.delete(messageId);
      // A Run that was stopped, timed out or threw has no terminal chunk of its own. A reader that
      // sees its log end without one takes the stream as cut off and reconnects, which starts the
      // Run again, so the log is ended explicitly.
      if (!logEnded) {
        void deps.runStreams
          .append(
            messageId,
            endingChunk(
              ids ?? { threadId: messageId, runId: messageId },
              timedOut ? "timed out" : interrupted ? "interrupted" : error?.message,
            ),
          )
          .catch((caught: unknown) => console.error(`Logging Message ${messageId} failed`, caught));
      }
      await deps.runStreams.close(messageId);
      // The run ended `complete`: title its Conversation, fire-and-forget.
      if (!timedOut && !abortController.signal.aborted && error === undefined) {
        void titleConversation(deps, messageId);
      }
    }
  })();
}

/** The thread and run ids a chat() chunk carries, so the ending chunk belongs to the same run. */
function runIdsOf(chunk: StreamChunk) {
  const { threadId, runId } = chunk as { threadId?: unknown; runId?: unknown };
  return typeof threadId === "string" && typeof runId === "string"
    ? { threadId, runId }
    : undefined;
}

/** The chunk that ends a Run's log: a `RUN_ERROR` when it failed or timed out, else a `RUN_FINISHED`. */
function endingChunk(
  ids: { threadId: string; runId: string },
  errorMessage: string | undefined,
): StreamChunk {
  const timestamp = Date.now();
  return errorMessage === undefined
    ? { type: EventType.RUN_FINISHED, ...ids, finishReason: "stop", timestamp }
    : { type: EventType.RUN_ERROR, ...ids, message: errorMessage, timestamp };
}

/**
 * The stream's chunks until the signal aborts. An adapter that ignored the signal would keep the
 * run waiting, so the run stops reading instead, and leaves the stream behind. The adapters that
 * ignored it (Bedrock, Mistral, Ollama) are made to cancel the request: see `adapters.ts` and
 * `patches/` (issue #54).
 */
async function* untilAborted<T>(stream: AsyncIterable<T>, signal: AbortSignal) {
  const iterator = stream[Symbol.asyncIterator]();
  const aborted = new Promise<"aborted">((resolve) => {
    if (signal.aborted) resolve("aborted");
    signal.addEventListener("abort", () => resolve("aborted"), { once: true });
  });
  while (true) {
    const next = await Promise.race([iterator.next(), aborted]);
    if (next === "aborted") {
      void iterator.return?.()?.catch(() => {});
      return;
    }
    if (next.done) return;
    yield next.value;
  }
}

/** A thrown Provider error as a `RUN_ERROR` would report it: its message, and its code or status. */
function thrownError(caught: unknown): ProviderError {
  const { code, status } = (typeof caught === "object" && caught !== null ? caught : {}) as {
    code?: unknown;
    status?: unknown;
  };
  return {
    message: caught instanceof Error ? caught.message : String(caught),
    code: typeof code === "string" ? code : typeof status === "number" ? String(status) : undefined,
  };
}

/**
 * Why a Provider error happened, from the code the adapter reports: the Provider's error code
 * (OpenAI) or the HTTP status (Anthropic, whose SDK errors carry no code).
 */
function errorReasonOf(code: string | undefined): MessageErrorReason {
  switch (code) {
    case "401":
    case "403":
    case "invalid_api_key":
      return "invalid_key";
    case "429":
    case "rate_limit_exceeded":
    case "insufficient_quota":
      return "rate_limited";
    default:
      return "provider_error";
  }
}

/**
 * Stops the run of a Message: aborts it when it runs in this process (it then saves itself
 * `stopped`), otherwise marks a leftover `streaming` row `stopped`. Ended Messages stay as they are.
 */
export async function stopRun(deps: AppDeps, messageId: string) {
  const run = deps.runs.get(messageId);
  if (run) {
    run.abort();
    return;
  }
  await deps.db
    .update(message)
    .set({ status: "stopped" })
    .where(and(eq(message.id, messageId), eq(message.status, "streaming")));
}

/**
 * The reason a Run is aborted with when `stop()` ends it after the drain, so the Run saves itself
 * `error` "interrupted" rather than `stopped`.
 */
export const shutdownAbort = new Error("The chat SDK is stopping");

/**
 * Reaps the Runs whose owner has stopped heartbeating (ADR 0006), from any process: every
 * `streaming` Message whose heartbeat is older than the lease, or was never written, ends as
 * `error` "interrupted". A search it left running is `cancelled`, and its log ends with a
 * `RUN_ERROR` and closes, so a reader doesn't reconnect into a Run that is gone.
 */
export async function reapStaleRuns(deps: AppDeps, now = new Date()) {
  const cutoff = new Date(now.getTime() - deps.limits.leaseMs);
  const reaped = await deps.db
    .update(message)
    .set({ status: "error", error: "interrupted" })
    .where(
      and(
        eq(message.status, "streaming"),
        or(isNull(message.heartbeatAt), lt(message.heartbeatAt, cutoff)),
      ),
    )
    .returning({ id: message.id, parts: message.parts });
  for (const row of reaped) {
    // A row that doesn't parse holds no running search, and mustn't stop the reaper.
    const parsed = storedPartsSchema.safeParse(row.parts);
    if (
      parsed.success &&
      parsed.data.parts.some((part) => part.type === "web_search" && part.state === "running")
    ) {
      await deps.db
        .update(message)
        .set({ parts: cancelRunningSearches(parsed.data) })
        .where(eq(message.id, row.id));
    }
    const ids = { threadId: row.id, runId: row.id };
    await deps.runStreams.open(row.id);
    await deps.runStreams.append(row.id, endingChunk(ids, "interrupted"));
    await deps.runStreams.close(row.id);
  }
}
