import type { Context as ApiContext } from "@ai-chat/chat-sdk/server";

import { auth, deps } from "./services";

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    deps,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
