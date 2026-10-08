import { listAvailableModels } from "../chat/available-models";
import { protectedProcedure } from "../index";

export const modelsRouter = {
  /** The Models of Providers the caller has credentials for, and a new Conversation's default. */
  list: protectedProcedure.handler(({ context }) =>
    listAvailableModels(context.deps, context.session.user.id),
  ),
};
