import { conversation } from "@ai-chat/db/schema/chat";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { findModel } from "../chat/models";
import { findConversation, loadPath, toClientMessage } from "../chat/store";
import { protectedProcedure } from "../index";
import { uuidv7 } from "../lib/uuidv7";

export const conversationRouter = {
  /** Starts an empty Conversation; the first Message is sent through `/api/chat`. */
  create: protectedProcedure
    .input(z.object({ model: z.string() }))
    .handler(async ({ context, input }) => {
      if (!findModel(input.model)) {
        throw new ORPCError("BAD_REQUEST", {
          message: `"${input.model}" is not an available Model`,
        });
      }
      const id = uuidv7();
      await context.deps.db
        .insert(conversation)
        .values({ id, userId: context.session.user.id, model: input.model });
      return { id };
    }),

  /** The Conversation with its Active Branch, oldest Message first. */
  get: protectedProcedure.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
    const row = await findConversation(context.deps, context.session.user.id, input.id);
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    const path = await loadPath(context.deps, row.id, row.activeLeafId);
    return {
      id: row.id,
      title: row.title,
      model: row.model,
      messages: path.map(toClientMessage),
    };
  }),
};
