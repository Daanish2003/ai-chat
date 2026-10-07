import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { chatRouter } from "./chat";
import { conversationRouter } from "./conversation";
import { credentialsRouter } from "./credentials";
import { modelsRouter } from "./models";
import { settingsRouter } from "./settings";
import { searchRouter } from "./search";
import { shareRouter } from "./share";

export const appRouter = {
  chat: chatRouter,
  conversation: conversationRouter,
  credentials: credentialsRouter,
  models: modelsRouter,
  settings: settingsRouter,
  search: searchRouter,
  share: shareRouter,
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
