import { describe, expect, it } from "vitest";

import { messageInfo, takePendingFirstMessage, toUIMessages, setPendingFirstMessage } from "./chat";

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

describe("pending first message", () => {
  it("is handed out once", () => {
    setPendingFirstMessage("c1", "Hello");

    expect(takePendingFirstMessage("c1")).toBe("Hello");
    expect(takePendingFirstMessage("c1")).toBeUndefined();
  });
});
