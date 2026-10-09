import { randomUUID } from "node:crypto";

import { user as userTable } from "@ai-chat/db/schema/auth";
import { createRouterClient } from "@orpc/server";

import type { ChatUser } from "../../core/server/context";
import type { AppDeps } from "../../core/server/deps";
import { appRouter } from "../../core/server/routers/index";
import { createTestDeps } from "./deps";
import { getTestDb } from "./test-database";

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

/** The user as `getUser` returns them to the SDK. */
export function chatUserFor(user: TestUser): ChatUser {
  return { id: user.id };
}

/** Calls `appRouter` in process, signed in as `user` (or signed out without one). */
export function createTestClient({ user, deps }: { user?: TestUser; deps?: AppDeps } = {}) {
  return createRouterClient(appRouter, {
    context: {
      user: user ? chatUserFor(user) : null,
      deps: deps ?? createTestDeps(),
    },
  });
}
