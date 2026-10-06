import { createAppDeps } from "@ai-chat/api/deps";
import { createAuth } from "@ai-chat/auth";
import { createDb } from "@ai-chat/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const deps = createAppDeps({ db, keyEncryptionSecret: ENV.KEY_ENCRYPTION_SECRET });
