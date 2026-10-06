import { describe, expect, it } from "vitest";

import { createTestClient, insertUser } from "../testing/router-client";

describe("healthCheck", () => {
  it("answers OK without a session", async () => {
    const client = createTestClient();

    await expect(client.healthCheck()).resolves.toBe("OK");
  });
});

describe("privateData", () => {
  it("rejects a caller without a session as UNAUTHORIZED", async () => {
    const client = createTestClient();

    await expect(client.privateData()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns the signed-in user", async () => {
    const user = await insertUser({ name: "Ada", email: "ada@example.com" });
    const client = createTestClient({ user });

    const result = await client.privateData();

    expect(result.message).toBe("This is private");
    expect(result.user).toMatchObject({ id: user.id, name: "Ada", email: "ada@example.com" });
  });
});
