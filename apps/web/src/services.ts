import { createAuth } from "@ai-chat/auth";
import { createDb } from "@ai-chat/db";
import { createChat } from "@ai-chat/chat-sdk/server";
import { log } from "evlog";

import { appName, sender } from "./email";
import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth({ ...ENV, APP_NAME: appName }, db, sender, log);
export const chat = createChat({
  databaseUrl: ENV.DATABASE_URL,
  keyEncryptionSecrets: [ENV.KEY_ENCRYPTION_SECRET, ENV.KEY_ENCRYPTION_SECRET_PREVIOUS].filter(
    (secret): secret is string => Boolean(secret),
  ),
  basePath: "/api/chat",
  getUser: async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user ? { id: session.user.id } : null;
  },
});
