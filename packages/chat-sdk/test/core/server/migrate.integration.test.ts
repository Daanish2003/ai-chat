import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createChat } from "../../../core/server/create-chat";
import {
  dropScratchDatabase,
  freshDatabaseUrl,
  testDatabaseUrl,
} from "../../support/test-database";

const keyEncryptionSecret = "test-key-encryption-secret-not-for-production";

function chatFor(databaseUrl: string) {
  return createChat({
    databaseUrl,
    getUser: () => null,
    keyEncryptionSecret,
    basePath: "/api/chat",
  });
}

/** Rows of a query run on its own connection, so each call sees the database as it is now. */
async function rows<T extends object>(url: string, text: string): Promise<T[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

const scratch: string[] = [];

async function scratchDatabase(suffix: string) {
  const url = await freshDatabaseUrl(suffix);
  scratch.push(url);
  return url;
}

afterAll(async () => {
  for (const url of scratch) await dropScratchDatabase(url);
}, 60_000);

const sdkTables = [
  "__migrations",
  "attachment",
  "attachment_blob",
  "conversation",
  "message",
  "message_attachment",
  "shared_link",
  "user_credentials",
  "user_settings",
];

describe("chat.migrate()", () => {
  it("creates every table and enum in the chat schema on an empty database", async () => {
    const url = await scratchDatabase("empty");

    await chatFor(url).migrate();

    const tables = await rows<{ table_name: string }>(
      url,
      "select table_name from information_schema.tables where table_schema = 'chat'",
    );
    expect(tables.map((row) => row.table_name).sort()).toEqual([...sdkTables].sort());

    const enums = await rows<{ typname: string }>(
      url,
      `select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'chat' and t.typtype = 'e'`,
    );
    expect(enums.map((row) => row.typname).sort()).toEqual([
      "message_error_reason",
      "message_role",
      "message_status",
    ]);
  });

  it("adds the Run columns to chat.message as nullable timestamps", async () => {
    const url = await scratchDatabase("columns");

    await chatFor(url).migrate();

    const columns = await rows<{ column_name: string; data_type: string; is_nullable: string }>(
      url,
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'chat' and table_name = 'message'
         and column_name in ('cancel_requested_at', 'heartbeat_at')`,
    );
    expect(columns.sort((a, b) => a.column_name.localeCompare(b.column_name))).toEqual([
      {
        column_name: "cancel_requested_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      },
      { column_name: "heartbeat_at", data_type: "timestamp with time zone", is_nullable: "YES" },
    ]);
  });

  it("names the trigram operator class with its schema, and no foreign key leaves chat", async () => {
    const url = await scratchDatabase("refs");

    await chatFor(url).migrate();

    // Postgres drops the schema from `pg_indexes` when it is on the search path, so the bundled
    // SQL is what shows the name.
    const migrationsFolder = fileURLToPath(
      new URL("../../../core/server/migrations", import.meta.url),
    );
    const migrationSql = readdirSync(migrationsFolder)
      .map((name) => readFileSync(join(migrationsFolder, name, "migration.sql"), "utf8"))
      .join("\n");
    expect(migrationSql.match(/gin_trgm_ops/g)).toHaveLength(2);
    expect(migrationSql.match(/public\.gin_trgm_ops/g)).toHaveLength(2);

    const outside = await rows<{ conname: string }>(
      url,
      `select c.conname from pg_constraint c
         join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
         join pg_class target on target.oid = c.confrelid
         join pg_namespace tn on tn.oid = target.relnamespace
       where c.contype = 'f' and n.nspname = 'chat' and tn.nspname <> 'chat'`,
    );
    expect(outside).toEqual([]);
  });

  it("does nothing when run again", async () => {
    const url = await scratchDatabase("rerun");
    const chat = chatFor(url);
    await chat.migrate();
    const before = await rows<{ count: string }>(url, "select count(*) from chat.__migrations");

    await chat.migrate();

    const after = await rows<{ count: string }>(url, "select count(*) from chat.__migrations");
    expect(after).toEqual(before);
  });

  it("lets two concurrent runs both succeed, with the migrations applied once", async () => {
    const url = await scratchDatabase("concurrent");
    const chat = chatFor(url);

    await expect(Promise.all([chat.migrate(), chat.migrate()])).resolves.toBeDefined();

    const applied = await rows<{ count: string }>(url, "select count(*) from chat.__migrations");
    expect(applied).toEqual([{ count: "1" }]);
  });

  it("throws an error naming pg_trgm when the role may not create it", async () => {
    const url = await scratchDatabase("no_trgm");
    // The schema exists already, so the failure is the extension and not the schema.
    await rows(url, "create schema chat");
    await rows(
      testDatabaseUrl,
      `do $$ begin
         create role chat_no_create login password 'password';
       exception when duplicate_object then null; end $$`,
    );
    const roleUrl = new URL(url);
    roleUrl.username = "chat_no_create";
    roleUrl.password = "password";

    await expect(chatFor(roleUrl.toString()).migrate()).rejects.toThrow(/pg_trgm/);
  });
});

describe("chat.start()", () => {
  it("throws on a database that was never migrated", async () => {
    const url = await scratchDatabase("start_empty");

    await expect(chatFor(url).start()).rejects.toThrow(/chat\.migrate\(\)/);
  });

  it("starts once migrated, and throws again when the journal is behind", async () => {
    const url = await scratchDatabase("start_stale");
    const chat = chatFor(url);
    await chat.migrate();

    await expect(chat.start()).resolves.toBeUndefined();

    // A journal with nothing applied is behind the bundled migrations.
    await rows(url, "delete from chat.__migrations");
    await expect(chat.start()).rejects.toThrow(/chat\.migrate\(\)/);
  });
});
