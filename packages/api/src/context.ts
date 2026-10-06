import type { Session } from "@ai-chat/auth";
import type { Database } from "@ai-chat/db";

export type Context = {
  session: Session | null;
  db: Database;
};
