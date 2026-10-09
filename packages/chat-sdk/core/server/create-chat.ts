import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { handleChat } from "./chat/handle-chat";
import { handleJoin } from "./chat/join-run";
import type { ChatUser, Context } from "./context";
import { createDb } from "./db/index";
import { createAppDeps, type AppDeps } from "./deps";
import { memoryRuntime, type ChatRuntime } from "./runtime";
import { appRouter } from "./routers/index";

export type ChatHandler = (request: Request) => Promise<Response>;

/** Where the RPC calls' errors go. */
export type Logger = Pick<Console, "error">;

export type GetUser = (request: Request) => ChatUser | null | Promise<ChatUser | null>;

export type CreateChatOptions = {
  databaseUrl: string;
  /** Who the request is from. `null` answers 401, except for the public Shared link read. */
  getUser: GetUser;
  /** `KEY_ENCRYPTION_SECRET`: encrypts Provider and Tool credentials at rest (ADR 0003). */
  keyEncryptionSecret: string;
  /** Where the handler is mounted, for example `/api/chat`. */
  basePath: string;
  runtime?: ChatRuntime;
  logger?: Logger;
};

/**
 * Builds the handler over a dependency bundle. `createChat` passes it the production bundle; tests
 * pass one with fakes.
 */
export function createChatHandler(
  deps: AppDeps,
  {
    basePath,
    getUser,
    logger = console,
  }: Pick<CreateChatOptions, "basePath" | "getUser" | "logger">,
): ChatHandler {
  if (!basePath.startsWith("/")) throw new Error(`basePath must start with "/": ${basePath}`);
  const prefix = basePath.replace(/\/+$/, "");
  const rpcPrefix = `${prefix}/rpc` as `/${string}`;
  const runPath = `${prefix}/run`;
  const sharedReadPath = `${rpcPrefix}/share/get`;
  const rpc = new RPCHandler(appRouter, {
    interceptors: [onError((error) => logger.error(error))],
  });

  return async (request) => {
    const { pathname } = new URL(request.url);
    const user = await getUser(request);
    if (!user && pathname !== sharedReadPath) return unauthorized();

    if (pathname === rpcPrefix || pathname.startsWith(`${rpcPrefix}/`)) {
      const context: Context = { user, deps };
      const result = await rpc.handle(request, { prefix: rpcPrefix, context });
      return result.matched ? result.response : notFound();
    }
    if (user && pathname === runPath) {
      if (request.method === "POST") return handleChat(request, user, deps);
      if (request.method === "GET") return handleJoin(request, user, deps);
    }
    return notFound();
  };
}

/**
 * The Chat SDK for a Host. Nothing connects, starts or queries until the first request, so the
 * Host can build it at import time.
 */
export function createChat(options: CreateChatOptions): { handler: ChatHandler } {
  let handler: ChatHandler | undefined;
  return {
    handler: (request) => {
      handler ??= createChatHandler(
        createAppDeps({
          db: createDb({ DATABASE_URL: options.databaseUrl }),
          keyEncryptionSecret: options.keyEncryptionSecret,
          runtime: options.runtime ?? memoryRuntime(),
        }),
        options,
      );
      return handler(request);
    },
  };
}

function unauthorized() {
  return Response.json({ message: "Sign in to chat" }, { status: 401 });
}

function notFound() {
  return new Response("Not found", { status: 404 });
}
