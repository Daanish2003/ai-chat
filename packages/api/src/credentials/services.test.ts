import { describe, expect, it } from "vitest";

import { addKeyMessage } from "./services";

describe("addKeyMessage", () => {
  it("asks for the Provider's key, with the right article", () => {
    expect(addKeyMessage("openai")).toBe("Add an OpenAI key or pick another Model");
    expect(addKeyMessage("gemini")).toBe("Add a Google Gemini key or pick another Model");
  });
});
