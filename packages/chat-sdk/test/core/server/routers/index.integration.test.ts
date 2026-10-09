import { describe, expect, it } from "vitest";

import { createTestClient, insertUser } from "../../../support/router-client";

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
    const user = await insertUser();
    const client = createTestClient({ user });

    const result = await client.privateData();

    expect(result.message).toBe("This is private");
    expect(result.user).toEqual({ id: user.id });
  });
});
