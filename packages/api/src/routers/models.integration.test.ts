import { describe, expect, it } from "vitest";

import { saveCredentials } from "../credentials/store";
import { insertConversation } from "../testing/conversations";
import { createTestDeps } from "../testing/deps";
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
