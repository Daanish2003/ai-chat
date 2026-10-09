import { describe, expect, it } from "vitest";

import { createTestDeps } from "../../../support/deps";
import { insertUser } from "../../../support/users";
import { chatRpc } from "../../../support/sdk";

const deps = createTestDeps();

async function signedIn() {
  const user = await insertUser();
  return { user, client: chatRpc({ user, deps }) };
}

describe("settings", () => {
  it("has no Title Model by default (the Model that wrote the first reply)", async () => {
    const { client } = await signedIn();

    await expect(client.settings.get()).resolves.toEqual({ titleModel: null });
  });

  it("saves the Title Model and resets it to the default", async () => {
    const { client } = await signedIn();

    await client.settings.setTitleModel({ titleModel: "openai:gpt-5.4-mini" });
    await expect(client.settings.get()).resolves.toEqual({ titleModel: "openai:gpt-5.4-mini" });

    await client.settings.setTitleModel({ titleModel: null });
    await expect(client.settings.get()).resolves.toEqual({ titleModel: null });
  });

  it("keeps each user's Title Model to themselves", async () => {
    const { client } = await signedIn();
    const other = await signedIn();

    await client.settings.setTitleModel({ titleModel: "openai:gpt-5.4-mini" });

    await expect(other.client.settings.get()).resolves.toEqual({ titleModel: null });
  });

  it("rejects a Model that isn't on the list", async () => {
    const { client } = await signedIn();

    await expect(client.settings.setTitleModel({ titleModel: "openai:nope" })).rejects.toThrow(
      /not an available Model/,
    );
  });

  it("rejects signed-out callers", async () => {
    const client = chatRpc({ deps });

    await expect(client.settings.get()).rejects.toThrow();
    await expect(client.settings.setTitleModel({ titleModel: null })).rejects.toThrow();
  });
});
