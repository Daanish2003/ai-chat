import { ANTHROPIC_MODELS } from "@tanstack/ai-anthropic";
import { OPENAI_CHAT_MODELS } from "@tanstack/ai-openai";
import { describe, expect, it } from "vitest";

import { curatedModels, findModel } from "./models";

const packageModels: Record<string, readonly string[]> = {
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_CHAT_MODELS,
};

describe("curated Model list", () => {
  it("offers 3 to 6 Models for Anthropic and for OpenAI", () => {
    for (const provider of ["anthropic", "openai"]) {
      const count = curatedModels.filter((model) => model.provider === provider).length;
      expect(count, provider).toBeGreaterThanOrEqual(3);
      expect(count, provider).toBeLessThanOrEqual(6);
    }
  });

  it.each(curatedModels)("$id exists in its package's *_MODELS export", (model) => {
    expect(packageModels[model.provider]).toContain(model.modelId);
    expect(model.id).toBe(`${model.provider}:${model.modelId}`);
    expect(model.label).not.toBe("");
    expect(typeof model.images).toBe("boolean");
    expect(typeof model.pdfs).toBe("boolean");
    expect(typeof model.tools).toBe("boolean");
  });

  it("finds a Model by its provider:model id", () => {
    expect(findModel("anthropic:claude-sonnet-5-5")).toMatchObject({
      provider: "anthropic",
      modelId: "claude-sonnet-5-5",
    });
  });

  it("finds nothing for an id that isn't curated", () => {
    expect(findModel("anthropic:claude-2")).toBeUndefined();
    expect(findModel("claude-sonnet-5-5")).toBeUndefined();
    expect(findModel("gemini:claude-sonnet-5-5")).toBeUndefined();
  });
});
