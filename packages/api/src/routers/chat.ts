import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { stopRun } from "../chat/run";
import { findMessage } from "../chat/store";
import { protectedProcedure } from "../index";

export const chatRouter = {
  /**
   * Stops the run writing a streaming assistant Message (ADR 0002). The run saves it `stopped`
   * and the client just sees its stream close. A Message that already ended is left alone.
   */
  stop: protectedProcedure
    .input(z.object({ messageId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const owned = await findMessage(context.deps, context.session.user.id, input.messageId);
      if (!owned) throw new ORPCError("NOT_FOUND", { message: "Message not found" });
      await stopRun(context.deps, owned.id);
    }),
};
