import { chat, EventType, type StreamChunk, toolDefinition } from "@tanstack/ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createFakeAdapter, round, runError, text, thinking, toolCall } from "./fake-adapter";

const hello = [{ role: "user" as const, content: "Hello" }];

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function deltas(chunks: StreamChunk[], type: EventType) {
  return chunks.flatMap((chunk) =>
    chunk.type === type && "delta" in chunk && typeof chunk.delta === "string" ? [chunk.delta] : [],
  );
}

describe("createFakeAdapter", () => {
  it("streams a scripted text reply through chat()", async () => {
    const fake = createFakeAdapter({ rounds: [round(text("Hi ", "there"))] });

    const reply = await chat({ adapter: fake.adapter, messages: hello, stream: false });

    expect(reply).toBe("Hi there");
    expect(fake.calls).toHaveLength(1);
  });

  it("streams thinking as REASONING_* events", async () => {
    const fake = createFakeAdapter({ rounds: [round(thinking("Let me think"), text("Done"))] });

    const chunks = await collect(chat({ adapter: fake.adapter, messages: hello }));

    expect(deltas(chunks, EventType.REASONING_MESSAGE_CONTENT)).toEqual(["Let me think"]);
    expect(deltas(chunks, EventType.TEXT_MESSAGE_CONTENT)).toEqual(["Done"]);
  });

  it("plays one round per tool-loop iteration", async () => {
    const inputs: unknown[] = [];
    const lookup = toolDefinition({
      name: "lookup",
      description: "Looks something up",
      inputSchema: z.object({ query: z.string() }),
    }).server(async (input) => {
      inputs.push(input);
      return { answer: 42 };
    });
    const fake = createFakeAdapter({
      rounds: [
        round(toolCall({ id: "call-1", name: "lookup", input: { query: "meaning" } })),
        round(text("It is 42")),
      ],
    });

    const reply = await chat({
      adapter: fake.adapter,
      messages: hello,
      tools: [lookup],
      stream: false,
    });

    expect(inputs).toEqual([{ query: "meaning" }]);
    expect(reply).toBe("It is 42");
    expect(fake.calls).toHaveLength(2);
    expect(JSON.stringify(fake.calls[1]?.messages)).toContain("42");
  });

  it("ends a round with a run error", async () => {
    const fake = createFakeAdapter({
      rounds: [round(text("Partial"), runError("Rate limited", "rate_limited"))],
    });

    const chunks = await collect(chat({ adapter: fake.adapter, messages: hello }));

    expect(chunks.at(-1)).toMatchObject({ type: "RUN_ERROR", message: "Rate limited" });
    expect(chunks.some((chunk) => chunk.type === "RUN_FINISHED")).toBe(false);
  });

  it("holds every chunk until the test releases it", async () => {
    const fake = createFakeAdapter({ rounds: [round(text("a", "b"))], manual: true });
    const received: string[] = [];
    const done = (async () => {
      for await (const chunk of chat({ adapter: fake.adapter, messages: hello })) {
        if (chunk.type === "TEXT_MESSAGE_CONTENT") received.push(chunk.delta);
      }
    })();

    await fake.release(2); // RUN_STARTED, TEXT_MESSAGE_START
    expect(received).toEqual([]);
    await fake.release(); // "a"
    expect(received).toEqual(["a"]);
    await fake.release(); // "b"
    expect(received).toEqual(["a", "b"]);
    await fake.releaseAll();
    await done;
  });

  it("stops streaming when the run is aborted while a chunk is held", async () => {
    const fake = createFakeAdapter({ rounds: [round(text("never"))], manual: true });
    const abortController = new AbortController();
    const done = collect(chat({ adapter: fake.adapter, messages: hello, abortController }));

    await fake.release(); // RUN_STARTED
    abortController.abort();
    const chunks = await done;

    expect(deltas(chunks, EventType.TEXT_MESSAGE_CONTENT)).toEqual([]);
  });
});
