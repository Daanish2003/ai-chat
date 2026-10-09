/// <reference types="node" />
/**
 * The end-to-end run's web server: creates the e2e database if missing, migrates and empties
 * it, then runs the production build (`.output`) in this process. Run by Playwright's
 * `webServer` with `serverEnv`; plain Node (type stripping), so imports keep their extensions.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// `pg` and Drizzle are the db package's dependencies, not the web app's.
const dbRequire = createRequire(new URL("../../../packages/db/package.json", import.meta.url));
const { Client } = dbRequire("pg");
const { drizzle } = dbRequire("drizzle-orm/node-postgres");

/**
 * `E2E_DATABASE_URL`, else `ai-chat_e2e` on the server of the app's `DATABASE_URL`. That one is
 * read in a child process: loading Varlock here would hand its resolved `.env` (and its
 * `NODE_ENV`) on to the server.
 */
function e2eDatabaseUrl() {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const appUrl = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('varlock/auto-load'); process.stdout.write(process.env.DATABASE_URL ?? '')",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (!appUrl) throw new Error("Set DATABASE_URL or E2E_DATABASE_URL");
  const url = new URL(appUrl);
  url.pathname = "/ai-chat_e2e";
  return url.toString();
}

const databaseUrl = e2eDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;

async function createDatabaseIfMissing() {
  const server = new URL(databaseUrl);
  const name = decodeURIComponent(server.pathname.slice(1));
  server.pathname = "/postgres";
  const client = new Client({ connectionString: server.toString() });
  await client.connect();
  try {
    const existing = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (existing.rowCount === 0) await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
}

/** The app's own migrate script: Better Auth's tables, then the chat schema. */
async function runMigrateScript() {
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("../scripts/migrate.ts", import.meta.url))],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    },
  );
}

/** Empties the app's tables and the chat schema's, but not the chat migration journal. */
async function empty() {
  // Drizzle opens its own pool: it doesn't recognise a client from another copy of `pg`.
  const db = drizzle(databaseUrl);
  try {
    const { rows } = await db.$client.query(
      `select schemaname, tablename from pg_tables
       where schemaname = 'public' or (schemaname = 'chat' and tablename <> '__migrations')`,
    );
    const tables = rows.map(
      ({ schemaname, tablename }: { schemaname: string; tablename: string }) =>
        `"${schemaname}"."${tablename}"`,
    );
    if (tables.length > 0) await db.$client.query(`truncate table ${tables.join(", ")} cascade`);
  } finally {
    await db.$client.end();
  }
}

await createDatabaseIfMissing();
await runMigrateScript();
await empty();
await import(
  pathToFileURL(fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url))).href
);
