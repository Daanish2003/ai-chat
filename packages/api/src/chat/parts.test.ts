import { EventType, type StreamChunk } from "@tanstack/ai";
import { describe, expect, it } from "vitest";

import {
  createPartsBuilder,
  parseStoredParts,
  searchTextOf,
  toModelMessages,
  toUIParts,
} from "./parts";

const at = Date.now();
const textStart = (messageId: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_START,
  messageId,
  role: "assistant",
  timestamp: at,
});
const textDelta = (messageId: string, delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId,
  delta,
  timestamp: at,
});
const runStarted: StreamChunk = {
  type: EventType.RUN_STARTED,
  runId: "run",
  threadId: "thread",
  timestamp: at,
};

function build(chunks: StreamChunk[]) {
  const builder = createPartsBuilder();
  for (const chunk of chunks) builder.add(chunk);
  return builder.parts();
}

describe("stored parts from a stream", () => {
  it("collects text deltas into one text part", () => {
    const chunks = [runStarted, textStart("a"), textDelta("a", "Hel"), textDelta("a", "lo!")];

    expect(build(chunks)).toEqual({ schemaVersion: 1, parts: [{ type: "text", text: "Hello!" }] });
  });

  it("starts a new text part for each text message", () => {
    const chunks = [textStart("a"), textDelta("a", "One."), textStart("b"), textDelta("b", "Two.")];

    expect(build(chunks).parts).toEqual([
      { type: "text", text: "One." },
      { type: "text", text: "Two." },
    ]);
  });

  it("leaves out a text message that never got any text", () => {
    expect(build([textStart("a"), textStart("b"), textDelta("b", "Hi")]).parts).toEqual([
      { type: "text", text: "Hi" },
    ]);
  });

  it("hands out snapshots that later chunks don't change", () => {
    const builder = createPartsBuilder();
    builder.add(textDelta("a", "Hi"));
    const snapshot = builder.parts();

    builder.add(textDelta("a", " there"));

    expect(snapshot.parts).toEqual([{ type: "text", text: "Hi" }]);
    expect(builder.parts().parts).toEqual([{ type: "text", text: "Hi there" }]);
  });
});
describe("stored parts to TanStack AI", () => {
  it("rebuilds provider history as text messages, oldest first", () => {
    const history = [
      {
        role: "user" as const,
        parts: { schemaVersion: 1 as const, parts: [{ type: "text" as const, text: "Hi" }] },
      },
      {
        role: "assistant" as const,
        parts: {
          schemaVersion: 1 as const,
          parts: [
            { type: "text" as const, text: "Hello. " },
            { type: "text" as const, text: "How can I help?" },
          ],
        },
      },
    ];

    expect(toModelMessages(history)).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello. How can I help?" },
    ]);
  });

  it("leaves out a Message with no text, such as a reply that failed before its first token", () => {
    const history = [
      {
        role: "user" as const,
        parts: { schemaVersion: 1 as const, parts: [{ type: "text" as const, text: "Hi" }] },
      },
      { role: "assistant" as const, parts: { schemaVersion: 1 as const, parts: [] } },
      {
        role: "user" as const,
        parts: { schemaVersion: 1 as const, parts: [{ type: "text" as const, text: "Hello?" }] },
      },
    ];

    expect(toModelMessages(history)).toEqual([
      { role: "user", content: "Hi" },
      { role: "user", content: "Hello?" },
    ]);
  });

  it("gives useChat text parts", () => {
    const parts = { schemaVersion: 1 as const, parts: [{ type: "text" as const, text: "Hi" }] };

    expect(toUIParts(parts)).toEqual([{ type: "text", content: "Hi" }]);
  });
});

describe("searchText", () => {
  it("is the plain text of the text parts", () => {
    const parts = {
      schemaVersion: 1 as const,
      parts: [
        { type: "text" as const, text: "First." },
        { type: "text" as const, text: "Second." },
      ],
    };

    expect(searchTextOf(parts)).toBe("First.\nSecond.");
  });
});

describe("reading stored parts", () => {
  it("accepts the current schema version", () => {
    const json = { schemaVersion: 1, parts: [{ type: "text", text: "Hi" }] };

    expect(parseStoredParts(json)).toEqual(json);
  });

  it("refuses an unknown schema version or part", () => {
    expect(() => parseStoredParts({ schemaVersion: 2, parts: [] })).toThrow();
    expect(() =>
      parseStoredParts({ schemaVersion: 1, parts: [{ type: "image", url: "x" }] }),
    ).toThrow();
  });
});
