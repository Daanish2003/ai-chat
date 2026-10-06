import { describe, expect, it } from "vitest";

import { adapterFor } from "./adapters";

describe("adapterFor", () => {
  it("builds the Anthropic adapter for an Anthropic Model", () => {
    const adapter = adapterFor("anthropic:claude-sonnet-5-5", { apiKey: "sk-ant-test" });

    expect(adapter).toMatchObject({ kind: "text", name: "anthropic", model: "claude-sonnet-5-5" });
  });

  it("builds the OpenAI Responses adapter for an OpenAI Model", () => {
    const adapter = adapterFor("openai:gpt-5.6", { apiKey: "sk-test" });

    expect(adapter).toMatchObject({ kind: "text", name: "openai", model: "gpt-5.6" });
  });

  it("refuses a Model that isn't curated", () => {
    expect(() => adapterFor("anthropic:claude-2", { apiKey: "sk-ant-test" })).toThrow(/claude-2/);
  });

  it("refuses credentials without an API key", () => {
    expect(() => adapterFor("openai:gpt-5.6", {})).toThrow(/API key/);
  });
});
