import { describe, expect, it } from "vitest";

import {
  availableModels,
  errorMessage,
  messageInfo,
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
      },
    ]);

    expect(messages).toEqual([
      {
        id: "q",
        role: "user",
        parts: [{ type: "text", content: "Hi" }],
        createdAt,
        metadata: { model: null, status: "complete", error: null, errorReason: null },
      },
      {
        id: "a",
        role: "assistant",
        parts: [{ type: "text", content: "Hello" }],
        createdAt,
        metadata: { model: "openai:gpt-5.6", status: "streaming", error: null, errorReason: null },
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

describe("errorMessage", () => {
  const info = (fields: Partial<MessageInfo>): MessageInfo => ({
    model: null,
    status: "error",
    error: null,
    errorReason: null,
    ...fields,
  });

  it("points a rejected key at Key settings", () => {
    expect(errorMessage(info({ error: "invalid x-api-key", errorReason: "invalid_key" }))).toEqual({
      text: "The Provider rejected your API key.",
      keySettings: true,
    });
  });

  it("explains a rate limit", () => {
    expect(errorMessage(info({ error: "Too many requests", errorReason: "rate_limited" }))).toEqual(
      {
        text: "The Provider rate limited this request. Try again in a moment.",
        keySettings: false,
      },
    );
  });

  it("quotes the Provider for any other Provider error", () => {
    expect(errorMessage(info({ error: "Overloaded", errorReason: "provider_error" }))).toEqual({
      text: "The Provider returned an error: Overloaded",
      keySettings: false,
    });
  });

  it("explains a run that timed out or was interrupted", () => {
    expect(errorMessage(info({ error: "timed out" })).text).toBe(
      "The reply took too long and timed out.",
    );
    expect(errorMessage(info({ error: "interrupted" })).text).toBe(
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
