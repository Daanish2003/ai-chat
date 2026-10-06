import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import { createDb, type Database } from "../index";

const DEFAULT_TEST_DATABASE_URL = "postgresql://postgres:password@localhost:5432/ai-chat_test";

/** The integration test database. Override with `TEST_DATABASE_URL`. */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Creates the test database if it is missing, then applies every migration. */
export async function prepareTestDatabase() {
  await createDatabaseIfMissing(testDatabaseUrl);
  const db = createDb({ DATABASE_URL: testDatabaseUrl });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}

async function createDatabaseIfMissing(url: string) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const server = new URL(url);
  server.pathname = "/postgres";

  const client = new Client({ connectionString: server.toString() });
  await client.connect();
  try {
    const existing = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (existing.rowCount === 0) {
      await client.query(`create database "${name.replaceAll('"', '""')}"`);
    }
  } finally {
    await client.end();
  }
}

let db: Database | undefined;

/** One connection pool to the test database per test file. */
export function getTestDb(): Database {
  db ??= createDb({ DATABASE_URL: testDatabaseUrl });
  return db;
}

export async function closeTestDb() {
  await db?.$client.end();
  db = undefined;
}

/** Empties every table in the public schema. */
export async function truncateAllTables(database: Database) {
  const { rows } = await database.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await database.execute(sql.raw(`truncate table ${tables} restart identity cascade`));
}
