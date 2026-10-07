import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { attachmentRouter } from "./attachment";
import { chatRouter } from "./chat";
import { conversationRouter } from "./conversation";
import { credentialsRouter } from "./credentials";
import { modelsRouter } from "./models";
import { shareRouter } from "./share";

export const appRouter = {
  attachment: attachmentRouter,
  chat: chatRouter,
  conversation: conversationRouter,
  credentials: credentialsRouter,
  models: modelsRouter,
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
