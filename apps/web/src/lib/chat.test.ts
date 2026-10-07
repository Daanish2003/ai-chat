import { describe, expect, it } from "vitest";

import {
  availableModels,
  branchFrom,
  describeError,
  messageInfo,
  messageSiblings,
  takePendingFirstMessage,
  toUIMessages,
  setPendingFirstMessage,
  type MessageInfo,
} from "./chat";

const createdAt = new Date("2026-10-06T12:00:00Z");

describe("toUIMessages", () => {
  it("hydrates useChat from the Active Branch, keeping each Message's status and Model", () => {
    const messages = toUIMessages([
      {
        id: "q",
        parentId: null,
        role: "user",
        parts: [{ type: "text", content: "Hi" }],
        model: null,
        status: "complete",
        error: null,
        errorReason: null,
        createdAt,
        siblings: { index: 0, count: 1, previousId: null, nextId: null },
      },
      {
        id: "a",
        parentId: "q",
        role: "assistant",
        parts: [{ type: "text", content: "Hello" }],
        model: "openai:gpt-5.6",
        status: "streaming",
        error: null,
        errorReason: null,
        createdAt,
        siblings: { index: 1, count: 2, previousId: "a0", nextId: null },
      },
    ]);

    expect(messages).toEqual([
      {
        id: "q",
        role: "user",
        parts: [{ type: "text", content: "Hi" }],
        createdAt,
        metadata: {
          model: null,
          status: "complete",
          error: null,
          errorReason: null,
          siblings: { index: 0, count: 1, previousId: null, nextId: null },
        },
      },
      {
        id: "a",
        role: "assistant",
        parts: [{ type: "text", content: "Hello" }],
        createdAt,
        metadata: {
          model: "openai:gpt-5.6",
          status: "streaming",
          error: null,
          errorReason: null,
          siblings: { index: 1, count: 2, previousId: "a0", nextId: null },
        },
      },
    ]);
    expect(messageInfo(messages[1]!)).toEqual({
      model: "openai:gpt-5.6",
      status: "streaming",
      error: null,
      errorReason: null,
    });
  });

  it("treats a message useChat is streaming, which has no server metadata, as streaming", () => {
    expect(messageInfo({ id: "x", role: "assistant", parts: [] })).toEqual({
      model: null,
      status: "streaming",
      error: null,
      errorReason: null,
    });
  });
});

describe("messageSiblings", () => {
  it("reads where the Message sits among its siblings", () => {
    const [, reply] = toUIMessages([
      {
        id: "q",
        parentId: null,
        role: "user",
        parts: [],
        model: null,
        status: "complete",
        error: null,
        errorReason: null,
        createdAt,
        siblings: { index: 0, count: 1, previousId: null, nextId: null },
      },
      {
        id: "a",
        parentId: "q",
        role: "assistant",
        parts: [],
        model: null,
        status: "complete",
        error: null,
        errorReason: null,
        createdAt,
        siblings: { index: 0, count: 3, previousId: null, nextId: "a2" },
      },
    ]);
    expect(messageSiblings(reply!)).toEqual({ index: 0, count: 3, previousId: null, nextId: "a2" });
  });

  it("is 1 of 1 for a message useChat is streaming", () => {
    expect(messageSiblings({ id: "x", role: "assistant", parts: [] })).toEqual({
      index: 0,
      count: 1,
      previousId: null,
      nextId: null,
    });
  });
});

describe("branchFrom", () => {
  const shown = [
    { id: "q1", role: "user" as const, parts: [] },
    { id: "a1", role: "assistant" as const, parts: [] },
    { id: "q2", role: "user" as const, parts: [] },
    { id: "a2", role: "assistant" as const, parts: [] },
  ];

  it("edits a Message under the same parent as the original, keeping what came before", () => {
    expect(branchFrom(shown, "q2")).toEqual({ parentId: "a1", history: shown.slice(0, 2) });
  });

  it("edits the first Message into a new root", () => {
    expect(branchFrom(shown, "q1")).toEqual({ parentId: null, history: [] });
  });

  it("regenerates a reply under the Message it answered", () => {
    expect(branchFrom(shown, "a2")).toEqual({ parentId: "q2", history: shown.slice(0, 3) });
  });
});

describe("describeError", () => {
  const info = (fields: Partial<MessageInfo>): MessageInfo => ({
    model: null,
    status: "error",
    error: null,
    errorReason: null,
    ...fields,
  });

  it("points a rejected key at Key settings", () => {
    expect(describeError(info({ error: "invalid x-api-key", errorReason: "invalid_key" }))).toEqual(
      {
        text: "The Provider rejected your API key.",
        keySettings: true,
      },
    );
  });

  it("explains a rate limit", () => {
    expect(
      describeError(info({ error: "Too many requests", errorReason: "rate_limited" })),
    ).toEqual({
      text: "The Provider rate limited this request. Try again in a moment.",
      keySettings: false,
    });
  });

  it("quotes the Provider for any other Provider error", () => {
    expect(describeError(info({ error: "Overloaded", errorReason: "provider_error" }))).toEqual({
      text: "The Provider returned an error: Overloaded",
      keySettings: false,
    });
  });

  it("still reads well when the Provider gave no message", () => {
    expect(describeError(info({ errorReason: "provider_error" })).text).toBe(
      "The Provider returned an error.",
    );
  });

  it("explains a run that timed out or was interrupted", () => {
    expect(describeError(info({ error: "timed out" })).text).toBe(
      "The reply took too long and timed out.",
    );
    expect(describeError(info({ error: "interrupted" })).text).toBe(
      "The reply was interrupted by a server restart.",
    );
  });
});

describe("availableModels", () => {
  it("offers only the Models of Providers the user has credentials for", () => {
    const models = availableModels([{ service: "openai", hint: "…abcd", verified: true }]);

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.provider === "openai")).toBe(true);
  });

  it("offers nothing without credentials", () => {
    expect(availableModels([])).toEqual([]);
  });
});

describe("pending first message", () => {
  it("is handed out once", () => {
    setPendingFirstMessage("c1", "Hello");

    expect(takePendingFirstMessage("c1")).toBe("Hello");
    expect(takePendingFirstMessage("c1")).toBeUndefined();
  });
});
