import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { findModel } from "../chat/models";
import { protectedProcedure } from "../index";
import { loadSettings, saveTitleModel } from "../settings/store";

export const settingsRouter = {
  get: protectedProcedure.handler(({ context }) =>
    loadSettings(context.deps, context.session.user.id),
  ),

  /**
   * Chooses the Model that writes automatic titles; `null` is "Same as first reply". Credentials
   * aren't required: without them, titles fall back to the start of the first Message.
   */
  setTitleModel: protectedProcedure
    .input(z.object({ titleModel: z.string().nullable() }))
    .handler(async ({ context, input }) => {
      if (input.titleModel !== null && !findModel(input.titleModel)) {
        throw new ORPCError("BAD_REQUEST", {
          message: `"${input.titleModel}" is not an available Model`,
        });
      }
      await saveTitleModel(context.deps, context.session.user.id, input.titleModel);
    }),
};
