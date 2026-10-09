import { createAuth } from "@ai-chat/auth";
import { createDb } from "@ai-chat/db";
import { createChat, createDb as createChatDb } from "@ai-chat/chat-sdk/server";

import { ENV } from "./env.server";

export const db = createDb(ENV);
/** The chat tables only, for the SDK's own queries (the boot sweep). */
export const chatDb = createChatDb(ENV);
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
