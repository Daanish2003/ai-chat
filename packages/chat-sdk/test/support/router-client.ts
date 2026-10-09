import { randomUUID } from "node:crypto";

import type { Session } from "@ai-chat/auth";
import { user as userTable } from "@ai-chat/db/schema/auth";
import { getTestDb } from "./test-database";
import { createRouterClient } from "@orpc/server";

import type { AppDeps } from "../../core/server/deps";
import { appRouter } from "../../core/server/routers/index";
import { createTestDeps } from "./deps";

export type TestUser = typeof userTable.$inferSelect;

/** Inserts a user row into the test database. */
export async function insertUser(fields: Partial<typeof userTable.$inferInsert> = {}) {
  const id = fields.id ?? randomUUID();
  const [row] = await getTestDb()
    .insert(userTable)
    .values({ name: "Test User", email: `${id}@example.com`, ...fields, id })
    .returning();
  if (!row) throw new Error("Inserting the test user returned no row");
  return row;
}

/** A Better Auth session for `user`, as `auth.api.getSession` would return it. */
export function sessionFor(user: TestUser): Session {
  const now = new Date();
  return {
    user,
    session: {
      id: randomUUID(),
      token: randomUUID(),
      userId: user.id,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  };
}

/** Calls `appRouter` in process, signed in as `user` (or signed out without one). */
export function createTestClient({ user, deps }: { user?: TestUser; deps?: AppDeps } = {}) {
  return createRouterClient(appRouter, {
    context: {
      session: user ? sessionFor(user) : null,
      deps: deps ?? createTestDeps(),
    },
  });
}
