import { message } from "@ai-chat/db/schema/chat";
import {
  type AnyTextAdapter,
  chat,
  EventType,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import { eq } from "drizzle-orm";

import type { AppDeps } from "../deps";
import { createPartsBuilder, searchTextOf } from "./parts";

type MessageUpdate = Partial<typeof message.$inferInsert>;

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

  void (async () => {
    let error: string | undefined;
    try {
      const stream = chat({ adapter, messages, abortController });
      for await (const chunk of stream) {
        parts.add(chunk);
        changed = true;
        if (chunk.type === EventType.RUN_ERROR) error = chunk.message;
        listener.push(chunk);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      clearInterval(snapshotTimer);
      await write(
        withParts(
          abortController.signal.aborted
            ? { status: "stopped" }
            : error !== undefined
              ? { status: "error", error, errorReason: "provider_error" }
              : { status: "complete" },
        ),
      );
      deps.runs.delete(messageId);
      listener.close();
    }
  })();

  return listener.chunks;
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

  async function* read(): AsyncGenerator<StreamChunk> {
    try {
      while (true) {
        const chunk = buffer.shift();
        if (chunk) {
          yield chunk;
        } else if (closed) {
          return;
        } else {
          await new Promise<void>((resolve) => (wake = resolve));
        }
      }
    } finally {
      detached = true;
      buffer.length = 0;
    }
  }

  return {
    chunks: { [Symbol.asyncIterator]: read },
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
