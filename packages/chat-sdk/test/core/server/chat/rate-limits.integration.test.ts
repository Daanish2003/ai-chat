import { describe, expect, it } from "vitest";

import { createChat } from "../../../../core/server/create-chat";
import { memoryRuntime } from "../../../../core/server/runtime";
import { resolveRateLimits } from "../../../../core/server/rate-limits";
import { createTestDeps } from "../../../support/deps";
import { testDatabaseUrl } from "../../../support/test-database";
import { insertUser } from "../../../support/users";
import { sendAs } from "../../../support/sdk";
import type { TestUser } from "../../../support/users";

const runUrl = "http://localhost/api/chat/run";

/**
 * A Run start that the limit counts. The body is not a valid command, so the handler refuses it
 * with 400 after the limit check, and no Conversation or Provider is touched.
 */
const runStart = (user: TestUser | null) =>
  user
    ? new Request(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [], forwardedProps: {} }),
      })
    : null;

describe("Run start rate limits", () => {
  it("answers 429 with Retry-After once a user passes the limit, and another user is unaffected", async () => {
    const user = await insertUser();
    const other = await insertUser();
    const deps = createTestDeps({
      rateLimits: resolveRateLimits({ runStart: { limit: 2, windowSeconds: 60 } }),
    });

    const first = await sendAs(runStart(user)!, user, deps);
    const second = await sendAs(runStart(user)!, user, deps);
    const limited = await sendAs(runStart(user)!, user, deps);
    const others = await sendAs(runStart(other)!, other, deps);

    expect([first.status, second.status]).toEqual([400, 400]);
    expect(limited.status).toBe(429);
    const retryAfter = Number(limited.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(others.status).toBe(400);
  });

  it("allows 20 Run starts a minute by default, then refuses the 21st", async () => {
    const user = await insertUser();
    const deps = createTestDeps();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt++) {
      statuses.push((await sendAs(runStart(user)!, user, deps)).status);
    }

    expect(statuses.slice(0, 20).every((status) => status === 400)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("takes its limit from createChat's rateLimits override", async () => {
    const user = await insertUser();
    const chat = createChat({
      databaseUrl: testDatabaseUrl,
      getUser: () => ({ id: user.id }),
      keyEncryptionSecret: "test-key-encryption-secret-not-for-production",
      basePath: "/api/chat",
      runtime: memoryRuntime(),
      rateLimits: { runStart: { limit: 1, windowSeconds: 60 } },
    });

    const first = await chat.handler(runStart(user)!);
    const second = await chat.handler(runStart(user)!);

    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
  });

  it("never refuses a Run start when its limit is turned off with false", async () => {
    const user = await insertUser();
    const deps = createTestDeps({ rateLimits: resolveRateLimits({ runStart: false }) });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 25; attempt++) {
      statuses.push((await sendAs(runStart(user)!, user, deps)).status);
    }

    expect(statuses.every((status) => status === 400)).toBe(true);
  });
});
