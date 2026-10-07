import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { chatRouter } from "./chat";
import { conversationRouter } from "./conversation";
import { credentialsRouter } from "./credentials";
import { shareRouter } from "./share";

export const appRouter = {
  chat: chatRouter,
  conversation: conversationRouter,
  credentials: credentialsRouter,
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
