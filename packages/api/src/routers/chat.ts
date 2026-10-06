import { conversation, message } from "@ai-chat/db/schema/chat";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { stopRun } from "../chat/run";
import { protectedProcedure } from "../index";

export const chatRouter = {
  /**
   * Stops the run writing a streaming assistant Message (ADR 0002). The run saves it `stopped`
   * and the client just sees its stream close. A Message that already ended is left alone.
   */
  stop: protectedProcedure
    .input(z.object({ messageId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [owned] = await context.deps.db
        .select({ id: message.id })
        .from(message)
        .innerJoin(conversation, eq(conversation.id, message.conversationId))
        .where(
          and(eq(message.id, input.messageId), eq(conversation.userId, context.session.user.id)),
        );
      if (!owned) throw new ORPCError("NOT_FOUND", { message: "Message not found" });
      await stopRun(context.deps, owned.id);
    }),
};
