import { createAuth } from "@ai-chat/auth";
import { createDb } from "@ai-chat/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
