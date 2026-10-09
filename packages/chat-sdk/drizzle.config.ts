import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

// The whole `public` schema: Better Auth's tables (owned by packages/db) and the chat tables.
export default defineConfig({
  schema: ["../db/src/schema/auth.ts", "./core/server/db/schema/index.ts"],
  out: "./core/server/migrations",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
