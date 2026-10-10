import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { handleChat } from "./chat/handle-chat";
import { handleJoin } from "./chat/join-run";
import type { ChatUser, Context } from "./context";
import { createDb } from "./db/index";
import { quotaLookup } from "./chat/quota";
import {
  createAppDeps,
  type AppDeps,
  type HostProvider,
  type HostTool,
  type QuotaSetting,
} from "./deps";
import { createLifecycle } from "./lifecycle";
import { deleteUserData } from "./delete-user";
import { countUnreadableCredentials } from "./credentials/store";
import { assertMigrated, migrate as migrateSchema } from "./migrate";
import { resolveRateLimits, type RateLimits } from "./rate-limits";
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
  /**
   * The keyring (ADR 0010), at least one secret. The first encrypts Provider and Tool credentials
   * at rest; every entry decrypts, so a key can be added in front of the old one.
   */
  keyEncryptionSecrets: string[];
  /** Where the handler is mounted, for example `/api/chat`. */
  basePath: string;
  runtime?: ChatRuntime;
  /** Overrides for the default rate limits (spec 87). Each action is optional; `false` turns it off. */
  rateLimits?: RateLimits;
  logger?: Logger;
  /**
   * The Host's own credentials (ADR 0007). A Provider entry carries its Models; a Tool entry (`tool:
   * "tavily"`) carries its price per search. Never stored.
   */
  hostProviders?: Array<HostProvider | HostTool>;
  /** Whether users may use their own Provider credentials. Defaults to `true` (ADR 0007). */
  byok?: boolean;
  /**
   * A user's Quota on Host credentials, or one fixed Quota for everyone; `null` or unset is
   * unlimited (ADR 0007).
   */
  getQuota?: QuotaSetting;
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
   * Refuses (throws) with neither `hostProviders` nor `byok` on, or while the `chat` schema is
   * behind the bundled migrations; then starts the reaper: now, and every 30 s (ADR 0006).
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
  if (options.keyEncryptionSecrets.length === 0) {
    throw new Error("keyEncryptionSecrets must hold at least one secret");
  }
  let deps: AppDeps | undefined;
  const getDeps = () => {
    deps ??= createAppDeps({
      db: createDb({ DATABASE_URL: options.databaseUrl }),
      keyEncryptionSecrets: options.keyEncryptionSecrets,
      runtime: options.runtime ?? memoryRuntime(),
      hostProviders: (options.hostProviders ?? []).filter(isHostProvider),
      hostTools: (options.hostProviders ?? []).filter(isHostTool),
      byok: options.byok ?? true,
      getQuota: quotaLookup(options.getQuota),
      rateLimits: resolveRateLimits(options.rateLimits),
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
      if (options.byok === false && !options.hostProviders?.length) {
        throw new Error("Configure hostProviders, byok, or both: with neither, no one can chat");
      }
      await assertMigrated(options.databaseUrl);
      // Unreadable rows are reported, never a reason to refuse to boot (ADR 0010).
      const unreadable = await countUnreadableCredentials(getDeps());
      if (unreadable.unknownKey + unreadable.corrupt > 0) {
        (options.logger ?? console).error("Stored credentials can't be read", unreadable);
      }
      await getLifecycle().start();
    },
    stop: async () => {
      await getLifecycle().stop();
      await options.runtime?.close?.();
    },
    deleteUser: (userId) => deleteUserData(getDeps(), userId),
  };
}

const isHostTool = (entry: HostProvider | HostTool): entry is HostTool => "tool" in entry;
const isHostProvider = (entry: HostProvider | HostTool): entry is HostProvider =>
  !isHostTool(entry);

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
