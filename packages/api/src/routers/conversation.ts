import { conversation } from "@ai-chat/db/schema/chat";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { findModel } from "../chat/models";
import { findConversation, listConversations, loadPath, toClientMessage } from "../chat/store";
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

  /** The caller's Conversations for the Conversation panel, newest Message first. */
  list: protectedProcedure.handler(({ context }) =>
    listConversations(context.deps, context.session.user.id),
  ),

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

  /** A manual rename; it always wins over the automatic title. Doesn't bump `lastMessageAt`. */
  rename: protectedProcedure
    .input(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200) }))
    .handler(async ({ context, input }) => {
      const [row] = await context.deps.db
        .update(conversation)
        .set({ title: input.title })
        .where(ownConversation(context.session.user.id, input.id))
        .returning({ id: conversation.id });
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),

  /** Deletes the Conversation for good; its Messages go with it (cascade). */
  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [row] = await context.deps.db
        .delete(conversation)
        .where(ownConversation(context.session.user.id, input.id))
        .returning({ id: conversation.id });
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),
};

function ownConversation(userId: string, id: string) {
  return and(eq(conversation.id, id), eq(conversation.userId, userId));
}
