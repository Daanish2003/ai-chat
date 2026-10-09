import { drizzle } from "drizzle-orm/node-postgres";

import { relations } from "./relations";

export function createDb(env: { DATABASE_URL: string }) {
  return drizzle(env.DATABASE_URL, { relations });
}

export type Database = ReturnType<typeof createDb>;
