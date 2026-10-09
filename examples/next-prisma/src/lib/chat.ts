import { createChat } from "@/chat-sdk/core/server";

import { auth } from "@/auth";

/**
 * The Chat SDK for this app. Built at import time with no side effects: nothing connects until a
 * request, `start()` or `migrate()`.
 */
export const chat = createChat({
  databaseUrl: process.env.DATABASE_URL ?? "",
  keyEncryptionSecret: process.env.KEY_ENCRYPTION_SECRET ?? "",
  basePath: "/api/chat",
  getUser: async () => {
    const session = await auth();
    return session ? { id: session.user.id } : null;
  },
});
