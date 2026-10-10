import { userCredentials } from "../db/schema/credentials";
import { and, eq } from "drizzle-orm";

import type { AppDeps, Credentials } from "../deps";
import type { CredentialSummary } from "../../shared/credentials/services";
import { tavilyService } from "../../shared/credentials/services";
import { decryptCredentials, encryptCredentials, type CredentialKind } from "./encryption";

type Deps = Pick<AppDeps, "db" | "keyEncryptionSecrets">;

/** Tool credentials and Provider credentials are encrypted under different keys (ADR 0010). */
const kindOf = (service: string): CredentialKind =>
  service === tavilyService ? "tool" : "provider";

const encryptionOptions = (deps: Deps, userId: string, service: string) => ({
  secrets: deps.keyEncryptionSecrets,
  kind: kindOf(service),
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
  const result = decryptCredentials(row.encrypted, encryptionOptions(deps, userId, service));
  return result.ok ? result.credentials : null;
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
    .filter(
      (row) => decryptCredentials(row.encrypted, encryptionOptions(deps, userId, row.service)).ok,
    )
    .map(({ service, hint, verified }) => ({ service, hint, verified }));
}

/** How many stored rows can't be read: under a key the keyring no longer holds, or corrupt. */
export async function countUnreadableCredentials(deps: Deps) {
  const rows = await deps.db.query.userCredentials.findMany({
    columns: { userId: true, service: true, encrypted: true },
  });
  const counts = { unknownKey: 0, corrupt: 0 };
  for (const row of rows) {
    const result = decryptCredentials(
      row.encrypted,
      encryptionOptions(deps, row.userId, row.service),
    );
    if (result.ok) continue;
    if (result.reason === "unknown-key") counts.unknownKey += 1;
    else counts.corrupt += 1;
  }
  return counts;
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
