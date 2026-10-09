import { createAuth } from "@ai-chat/auth";
import { createChat, createDb } from "@ai-chat/chat-sdk/server";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const chat = createChat({
  databaseUrl: ENV.DATABASE_URL,
  keyEncryptionSecret: ENV.KEY_ENCRYPTION_SECRET,
  basePath: "/api/chat",
  getUser: async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user ? { id: session.user.id } : null;
  },
});
