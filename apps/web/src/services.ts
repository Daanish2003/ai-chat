import { createAuth } from "@ai-chat/auth";
import { createAppDeps, createDb } from "@ai-chat/chat-sdk/server";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const deps = createAppDeps({ db, keyEncryptionSecret: ENV.KEY_ENCRYPTION_SECRET });
