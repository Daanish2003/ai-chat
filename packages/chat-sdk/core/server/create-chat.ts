import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { handleChat } from "./chat/handle-chat";
import { handleJoin } from "./chat/join-run";
import type { ChatUser, Context } from "./context";
import { createDb } from "./db/index";
import { createAppDeps, type AppDeps } from "./deps";
import { createLifecycle } from "./lifecycle";
import { deleteUserData } from "./delete-user";
import { assertMigrated, migrate as migrateSchema } from "./migrate";
import { memoryRuntime, type ChatRuntime } from "./runtime";
import { appRouter } from "./routers/index";
import { loadSharedConversation } from "./share/store";
import type { SharedConversation } from "../shared/share/conversation";

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
      if (request.method === "POST") {
        return deps.lifecycle.stopping ? shuttingDown() : handleChat(request, user, deps);
      }
      if (request.method === "GET") return handleJoin(request, user, deps);
    }
    return notFound();
  };
}

/**
 * The Chat SDK for a Host. Nothing connects, starts or queries until the first request, so the
 * Host can build it at import time.
 */
export function createChat(options: CreateChatOptions): {
  handler: ChatHandler;
  /** The public Shared link snapshot for a token, or `null` for an unknown or removed link. */
  getSharedConversation: (token: string) => Promise<SharedConversation | null>;
  /** Creates the `chat` schema and applies the bundled migrations. Run it at deploy time. */
  migrate: () => Promise<void>;
  /**
   * Refuses (throws) while the `chat` schema is behind the bundled migrations, then starts the
   * reaper: now, and every 30 s (ADR 0006).
   */
  start: () => Promise<void>;
  /**
   * Refuses new Runs with 503, lets local Runs finish for up to `drainMs` (250 s), then ends the
   * rest as interrupted, stops the reaper and closes the runtime's connections. Call it on SIGTERM.
   */
  stop: () => Promise<void>;
  /** Deletes everything the SDK holds for a user, in one transaction. Idempotent. */
  deleteUser: (userId: string) => Promise<void>;
} {
  let deps: AppDeps | undefined;
  const getDeps = () => {
    deps ??= createAppDeps({
      db: createDb({ DATABASE_URL: options.databaseUrl }),
      keyEncryptionSecret: options.keyEncryptionSecret,
      runtime: options.runtime ?? memoryRuntime(),
    });
    return deps;
  };
  let lifecycle: ReturnType<typeof createLifecycle> | undefined;
  const getLifecycle = () => (lifecycle ??= createLifecycle(getDeps()));
  let handler: ChatHandler | undefined;
  return {
    handler: (request) => {
      handler ??= createChatHandler(getDeps(), options);
      return handler(request);
    },
    getSharedConversation: async (token) =>
      (await loadSharedConversation(getDeps(), token)) ?? null,
    migrate: () => migrateSchema(options.databaseUrl),
    start: async () => {
      await assertMigrated(options.databaseUrl);
      await getLifecycle().start();
    },
    stop: async () => {
      await getLifecycle().stop();
      await options.runtime?.close?.();
    },
    deleteUser: (userId) => deleteUserData(getDeps(), userId),
  };
}

function unauthorized() {
  return Response.json({ message: "Sign in to chat" }, { status: 401 });
}

function shuttingDown() {
  return Response.json(
    { message: "The chat is shutting down; try again shortly" },
    { status: 503 },
  );
}

function notFound() {
  return new Response("Not found", { status: 404 });
}
