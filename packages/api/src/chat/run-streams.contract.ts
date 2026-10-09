import { EventType, type StreamChunk } from "@tanstack/ai";
import { describe, expect, it } from "vitest";

import { type RunEntry, type RunStreams, START } from "./run-streams";

/**
 * The contract every `RunStreams` implementation meets (ADR 0006). An implementation proves it by
 * running this suite unchanged, with its own factory:
 *
 *   runStreamsContract("redis", () => createRedisRunStreams(...));
 *
 * It uses only the public interface. Each test gets a fresh run id, so a factory may share one
 * store between tests. It assumes nothing about offsets beyond passing back what `read` returned.
 */
export function runStreamsContract(name: string, make: () => RunStreams | Promise<RunStreams>) {
  describe(`RunStreams contract: ${name}`, () => {
    /** A fresh, open run's log. */
    async function openRun() {
      const streams = await make();
      const runId = crypto.randomUUID();
      await streams.open(runId);
      return { streams, runId };
    }

    /** Collects a read to its end (the log closed) or to the signal's abort. */
    async function collect(entries: AsyncIterable<RunEntry>) {
      const out: RunEntry[] = [];
      for await (const entry of entries) out.push(entry);
      return out;
    }

    const deltas = (entries: RunEntry[]) =>
      entries.map((entry) => (entry.chunk as { delta: string }).delta);

    it("replays the whole log from the start, in append order", async () => {
      const { streams, runId } = await openRun();
      await streams.append(runId, text("a"));
      await streams.append(runId, text("b"));
      await streams.append(runId, text("c"));
      await streams.close(runId);

      expect(deltas(await collect(streams.read(runId, START)))).toEqual(["a", "b", "c"]);
    });

    it("keeps each chunk exactly as it was appended", async () => {
      const { streams, runId } = await openRun();
      const chunk = text("kept");
      await streams.append(runId, chunk);
      await streams.close(runId);

      expect((await collect(streams.read(runId, START)))[0]!.chunk).toEqual(chunk);
    });

    it("resumes strictly after the offset it is given", async () => {
      const { streams, runId } = await openRun();
      await streams.append(runId, text("a"));
      await streams.append(runId, text("b"));
      await streams.append(runId, text("c"));
      await streams.close(runId);
      const [first] = await collect(streams.read(runId, START));

      expect(deltas(await collect(streams.read(runId, first!.offset)))).toEqual(["b", "c"]);
    });

    it("a reader that joins mid-run gets every chunk from the start, then the rest live, then the end", async () => {
      const { streams, runId } = await openRun();
      await streams.append(runId, text("a"));
      await streams.append(runId, text("b"));

      const joined = collect(streams.read(runId, START));
      await streams.append(runId, text("c"));
      await streams.append(runId, text("d"));
      await streams.close(runId);

      expect(deltas(await joined)).toEqual(["a", "b", "c", "d"]);
    });

    it("a reader that starts before anything is appended waits for the chunks, and ends when the log closes", async () => {
      const { streams, runId } = await openRun();
      const reading = collect(streams.read(runId, START));

      await streams.append(runId, text("first"));
      await streams.close(runId);

      expect(deltas(await reading)).toEqual(["first"]);
    });

    it("a log that is already closed replays to a reader that arrives later", async () => {
      const { streams, runId } = await openRun();
      await streams.append(runId, text("done"));
      await streams.close(runId);

      expect(deltas(await collect(streams.read(runId, START)))).toEqual(["done"]);
      expect(deltas(await collect(streams.read(runId, START)))).toEqual(["done"]);
    });

    it("keeps order and loses nothing across many appends", async () => {
      const { streams, runId } = await openRun();
      const count = 300;
      const reading = collect(streams.read(runId, START));
      const written = [];
      for (let index = 0; index < count; index++) {
        written.push(streams.append(runId, text(`${index}`)));
      }
      await Promise.all(written);
      await streams.close(runId);

      expect(deltas(await reading)).toEqual(Array.from({ length: count }, (_, i) => `${i}`));
    });

    it("gives every reader the same entries", async () => {
      const { streams, runId } = await openRun();
      const first = collect(streams.read(runId, START));
      await streams.append(runId, text("a"));
      const second = collect(streams.read(runId, START));
      await streams.append(runId, text("b"));
      await streams.close(runId);

      expect(deltas(await first)).toEqual(["a", "b"]);
      expect(deltas(await second)).toEqual(["a", "b"]);
    });

    it("a reader aborted mid-run stops, and the log stays open for the next reader", async () => {
      const { streams, runId } = await openRun();
      await streams.append(runId, text("a"));
      const controller = new AbortController();
      const reading = collect(streams.read(runId, START, controller.signal));
      await streams.append(runId, text("b"));
      controller.abort();

      const aborted = await Promise.race([
        reading,
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2_000)),
      ]);
      expect(aborted).not.toBe("timeout");

      await streams.append(runId, text("c"));
      await streams.close(runId);
      expect(deltas(await collect(streams.read(runId, START)))).toEqual(["a", "b", "c"]);
    });

    it("reading a run that was never opened ends at once with nothing", async () => {
      const streams = await make();
      const ended = await Promise.race([
        collect(streams.read(crypto.randomUUID(), START)),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2_000)),
      ]);

      expect(ended).toEqual([]);
    });
  });
}

function text(delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: "message",
    delta,
    timestamp: 0,
  } as StreamChunk;
}
