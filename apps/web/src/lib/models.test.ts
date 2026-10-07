import { findModel } from "@ai-chat/api/chat/models";
import { describe, expect, it } from "vitest";

import { missingCredentialsMessage, modelGroups } from "./models";

const available = [
  "openai:gpt-5.6",
  "anthropic:claude-sonnet-5-5",
  "anthropic:claude-haiku-4-5",
  "openai:gpt-5.4-mini",
].map((id) => findModel(id)!);

describe("modelGroups", () => {
  it("groups the Models by Provider, in Provider order", () => {
    const groups = modelGroups(available, "");

    expect(groups.map((group) => [group.label, group.models.map((model) => model.id)])).toEqual([
      ["Anthropic", ["anthropic:claude-sonnet-5-5", "anthropic:claude-haiku-4-5"]],
      ["OpenAI", ["openai:gpt-5.6", "openai:gpt-5.4-mini"]],
    ]);
  });

  it("filters by the search text, ignoring case, and drops Providers left empty", () => {
    const groups = modelGroups(available, "  MINI ");

    expect(groups).toEqual([
      { provider: "openai", label: "OpenAI", models: [findModel("openai:gpt-5.4-mini")] },
    ]);
  });

  it("matches the Provider name too", () => {
    const groups = modelGroups(available, "anthro");

    expect(groups.map((group) => group.provider)).toEqual(["anthropic"]);
    expect(groups[0]!.models).toHaveLength(2);
  });
});

describe("missingCredentialsMessage", () => {
  it("is null while the selected Model's Provider has credentials", () => {
    expect(missingCredentialsMessage("openai:gpt-5.6", available)).toBeNull();
  });

  it("asks for the Provider's key when its credentials are gone", () => {
    expect(missingCredentialsMessage("openai:gpt-6-luna", available.slice(1, 3))).toBe(
      "Add an OpenAI key or pick another Model",
    );
    expect(missingCredentialsMessage("anthropic:claude-opus-5-5", [])).toBe(
      "Add an Anthropic key or pick another Model",
    );
  });

  it("asks for another Model when the selected one isn't offered any more", () => {
    expect(missingCredentialsMessage("openai:gpt-2", available)).toBe("Pick another Model");
  });
});
