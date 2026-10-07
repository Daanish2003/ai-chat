import { message } from "@ai-chat/db/schema/chat";
import {
  type AnyTextAdapter,
  chat,
  EventType,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import { and, eq, lt } from "drizzle-orm";

import type { AppDeps } from "../deps";
import { createPartsBuilder, searchTextOf } from "./parts";

type MessageUpdate = Partial<typeof message.$inferInsert>;
type MessageErrorReason = NonNullable<MessageUpdate["errorReason"]>;
type ProviderError = { message: string; code?: string };

/**
 * Runs one assistant Message (ADR 0002). The run drains `chat()` to the end on its own,
 * whether or not anyone reads the returned chunks: it snapshots the streaming Message's parts
 * every `deps.limits.snapshotIntervalMs`, and finishes the row in `finally`. It is registered in
 * `deps.runs` under the Message id until it ends; aborting that controller stops it.
 *
 * Returns the run's chunks for the SSE response. A reader that goes away only stops reading.
 */
export function startRun(
  deps: AppDeps,
  {
    messageId,
    adapter,
    messages,
  }: { messageId: string; adapter: AnyTextAdapter; messages: ModelMessage[] },
): AsyncIterable<StreamChunk> {
  const abortController = new AbortController();
  deps.runs.set(messageId, abortController);
  const listener = createChunkChannel();
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
    if (!changed) return;
    changed = false;
    void write(withParts());
  }, deps.limits.snapshotIntervalMs);

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
      const stream = chat({ adapter, messages, abortController });
      for await (const chunk of untilAborted(stream, abortController.signal)) {
        parts.add(chunk);
        changed = true;
        if (chunk.type === EventType.RUN_ERROR) {
          error = { message: chunk.message, code: chunk.code ?? chunk.error?.code };
        }
        listener.push(chunk);
      }
    } catch (caught) {
      error = thrownError(caught);
    } finally {
      clearInterval(snapshotTimer);
      clearTimeout(capTimer);
      await write(
        withParts(
          timedOut
            ? { status: "error", error: "timed out" }
            : abortController.signal.aborted
              ? { status: "stopped" }
              : error !== undefined
                ? { status: "error", error: error.message, errorReason: errorReasonOf(error.code) }
                : { status: "complete" },
        ),
      );
      deps.runs.delete(messageId);
      listener.close();
    }
  })();

  return listener.chunks;
}

/**
 * The stream's chunks until the signal aborts. Some adapters ignore the signal (Ollama's), so
 * the run stops reading instead of waiting for them, and leaves the stream behind.
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

/** Hands chunks to at most one reader; once the reader leaves, chunks are dropped. */
function createChunkChannel() {
  const buffer: StreamChunk[] = [];
  let closed = false;
  let detached = false;
  let wake: (() => void) | undefined;

  const notify = () => {
    wake?.();
    wake = undefined;
  };

  const done: IteratorReturnResult<undefined> = { done: true, value: undefined };
  // A hand-written iterator, not an async generator: a generator's `return()` waits until the
  // pending `next()` settles, so a client disconnect would hang until the run's next chunk.
  const reader: AsyncIterator<StreamChunk> = {
    async next() {
      while (true) {
        const chunk = buffer.shift();
        if (chunk) return { done: false, value: chunk };
        if (closed || detached) return done;
        await new Promise<void>((resolve) => (wake = resolve));
      }
    },
    async return() {
      detached = true;
      buffer.length = 0;
      notify();
      return done;
    },
  };

  return {
    chunks: { [Symbol.asyncIterator]: () => reader },
    push(chunk: StreamChunk) {
      if (detached) return;
      buffer.push(chunk);
      notify();
    },
    close() {
      closed = true;
      notify();
    },
  };
}

/**
 * Run at server start (ADR 0002): every `streaming` Message from before `bootedAt` was cut off by
 * a restart, so it ends as `error` "interrupted".
 */
export async function sweepInterruptedRuns(deps: Pick<AppDeps, "db">, bootedAt = new Date()) {
  // Only Messages from before boot: a run started meanwhile is going, not interrupted.
  await deps.db
    .update(message)
    .set({ status: "error", error: "interrupted" })
    .where(and(eq(message.status, "streaming"), lt(message.createdAt, bootedAt)));
}
