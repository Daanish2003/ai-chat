import { userCredentials } from "@ai-chat/db/schema/credentials";
import { and, eq } from "drizzle-orm";

import type { AppDeps, Credentials } from "../deps";
import { decryptCredentials, encryptCredentials } from "./encryption";

type Deps = Pick<AppDeps, "db" | "keyEncryptionSecret">;

export type CredentialSummary = { service: string; hint: string; verified: boolean };

const encryptionOptions = (deps: Deps, userId: string, service: string) => ({
  secret: deps.keyEncryptionSecret,
  context: `${userId}:${service}`,
});

/** The user's decrypted credentials for `service`, or `null` when missing or no longer decryptable. */
export async function loadCredentials(
  deps: Deps,
  userId: string,
  service: string,
): Promise<Credentials | null> {
  const row = await deps.db.query.userCredentials.findFirst({
    where: { userId, service },
    columns: { encrypted: true },
  });
  if (!row) return null;
  return decryptCredentials(row.encrypted, encryptionOptions(deps, userId, service));
}

/**
 * Hints of the user's credentials, in the order they were first added. Rows that no longer
 * decrypt count as missing and are left out.
 */
export async function listCredentials(deps: Deps, userId: string): Promise<CredentialSummary[]> {
  const rows = await deps.db.query.userCredentials.findMany({
    where: { userId },
    orderBy: { createdAt: "asc", service: "asc" },
  });
  return rows
    .filter((row) =>
      decryptCredentials(row.encrypted, encryptionOptions(deps, userId, row.service)),
    )
    .map(({ service, hint, verified }) => ({ service, hint, verified }));
}

/** Inserts or replaces the user's credentials for `service`. */
export async function saveCredentials(
  deps: Deps,
  userId: string,
  { service, fields, hint, verified }: CredentialSummary & { fields: Credentials },
) {
  const encrypted = encryptCredentials(fields, encryptionOptions(deps, userId, service));
  await deps.db
    .insert(userCredentials)
    .values({ userId, service, encrypted, hint, verified })
    .onConflictDoUpdate({
      target: [userCredentials.userId, userCredentials.service],
      set: { encrypted, hint, verified, updatedAt: new Date() },
    });
}

export async function deleteCredentials(deps: Deps, userId: string, service: string) {
  await deps.db
    .delete(userCredentials)
    .where(and(eq(userCredentials.userId, userId), eq(userCredentials.service, service)));
}
