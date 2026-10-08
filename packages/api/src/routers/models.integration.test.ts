import { describe, expect, it } from "vitest";

import { saveCredentials } from "../credentials/store";
import { insertConversation } from "../testing/conversations";
import { createTestDeps } from "../testing/deps";
import { liveModelsFetch } from "../testing/live-models";
import { createTestClient, insertUser, type TestUser } from "../testing/router-client";

const deps = createTestDeps();

async function addCredentials(user: TestUser, service: "anthropic" | "openai") {
  await saveCredentials(deps, user.id, {
    service,
    fields: { apiKey: `${service}-test-key` },
    hint: "…-key",
    verified: true,
  });
}

async function signedIn() {
  const user = await insertUser();
  return { user, client: createTestClient({ user, deps }) };
}

describe("models.list", () => {
  it("returns only the Models of Providers the user has credentials for, with capability flags", async () => {
    const { user, client } = await signedIn();
    await addCredentials(user, "openai");

    const { models } = await client.models.list();

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.provider === "openai")).toBe(true);
    expect(models).toContainEqual({
      id: "openai:gpt-5.6",
      provider: "openai",
      modelId: "gpt-5.6",
      label: "GPT-5.6",
      images: true,
      pdfs: false,
      tools: true,
    });
  });

  it("returns no Models and no default without credentials", async () => {
    const { client } = await signedIn();

    await expect(client.models.list()).resolves.toEqual({ models: [], defaultModel: null });
  });

  it("defaults a new Conversation to the code default of the first Provider the user added", async () => {
    const { user, client } = await signedIn();
    await addCredentials(user, "openai");
    await addCredentials(user, "anthropic");

    const { defaultModel } = await client.models.list();

    expect(defaultModel).toBe("openai:gpt-5.6");
  });

  it("defaults a new Conversation to the Model of the user's most recent Conversation", async () => {
    const { user, client } = await signedIn();
    await addCredentials(user, "openai");
    await addCredentials(user, "anthropic");
    await insertConversation(user, {
      model: "anthropic:claude-haiku-4-5",
      lastMessageAt: new Date("2026-10-01T10:00:00Z"),
    });
    await insertConversation(user, {
      model: "anthropic:claude-opus-5-5",
      lastMessageAt: new Date("2026-10-02T10:00:00Z"),
    });

    const { defaultModel } = await client.models.list();

    expect(defaultModel).toBe("anthropic:claude-opus-5-5");
  });

  it("skips the most recent Conversation's Model when its Provider has no credentials any more", async () => {
    const { user, client } = await signedIn();
    await addCredentials(user, "anthropic");
    await insertConversation(user, { model: "openai:gpt-6-luna" });

    const { defaultModel } = await client.models.list();

    expect(defaultModel).toBe("anthropic:claude-sonnet-5-5");
  });

  it("ignores other users' Conversations", async () => {
    const { user, client } = await signedIn();
    await addCredentials(user, "anthropic");
    const other = await insertUser();
    await insertConversation(other, { model: "anthropic:claude-opus-5-5" });

    const { defaultModel } = await client.models.list();

    expect(defaultModel).toBe("anthropic:claude-sonnet-5-5");
  });

  it("rejects a caller without a session", async () => {
    await expect(createTestClient({ deps }).models.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("models.list with live lists", () => {
  async function signedInWith(fetch: typeof globalThis.fetch) {
    const user = await insertUser();
    const liveDeps = createTestDeps({ fetch });
    return { user, deps: liveDeps, client: createTestClient({ user, deps: liveDeps }) };
  }

  it("lists OpenRouter's live Models for a user with OpenRouter credentials", async () => {
    const live = liveModelsFetch({ openRouter: ["anthropic/claude-sonnet-5.5", "openai/gpt-5.5"] });
    const { user, deps: liveDeps, client } = await signedInWith(live.fetch);
    await saveCredentials(liveDeps, user.id, {
      service: "openrouter",
      fields: { apiKey: "sk-or-test" },
      hint: "…test",
      verified: true,
    });

    const { models, defaultModel } = await client.models.list();

    expect(models.map((model) => model.id)).toEqual([
      "openrouter:anthropic/claude-sonnet-5.5",
      "openrouter:openai/gpt-5.5",
    ]);
    expect(models[0]).toMatchObject({ provider: "openrouter", pdfs: false, tools: true });
    expect(defaultModel).toBe("openrouter:anthropic/claude-sonnet-5.5");
  });

  it("lists the Models installed on the user's Ollama host, the first one as the default", async () => {
    const live = liveModelsFetch({ ollama: ["qwen3:8b", "llama3.2:latest"] });
    const { user, deps: liveDeps, client } = await signedInWith(live.fetch);
    await saveCredentials(liveDeps, user.id, {
      service: "ollama",
      fields: { host: "http://ollama.test:11434" },
      hint: "http://ollama.test:11434",
      verified: true,
    });

    const { models, defaultModel } = await client.models.list();

    expect(live.urls).toEqual(["http://ollama.test:11434/api/tags"]);
    expect(models).toEqual([
      {
        id: "ollama:qwen3:8b",
        provider: "ollama",
        modelId: "qwen3:8b",
        label: "qwen3:8b",
        images: false,
        pdfs: false,
        tools: true,
      },
      expect.objectContaining({ id: "ollama:llama3.2:latest" }),
    ]);
    expect(defaultModel).toBe("ollama:qwen3:8b");
  });

  it("doesn't fetch live lists for a user without OpenRouter or Ollama credentials", async () => {
    const live = liveModelsFetch({ openRouter: ["openai/gpt-5.5"] });
    const { user, deps: liveDeps, client } = await signedInWith(live.fetch);
    await saveCredentials(liveDeps, user.id, {
      service: "gemini",
      fields: { apiKey: "AIza-test" },
      hint: "…test",
      verified: true,
    });

    const { models, defaultModel } = await client.models.list();

    expect(live.urls).toEqual([]);
    expect(models.every((model) => model.provider === "gemini")).toBe(true);
    expect(defaultModel).toBe("gemini:gemini-3.8-flash");
  });
});
