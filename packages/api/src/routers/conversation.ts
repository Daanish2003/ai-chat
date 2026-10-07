import { conversation } from "@ai-chat/db/schema/chat";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { resolveModel } from "../chat/available-models";
import {
  deleteConversation,
  findConversation,
  listConversations,
  loadPath,
  renameConversation,
  setConversationModel,
  toClientMessage,
} from "../chat/store";
import { addKeyMessage } from "../credentials/services";
import { loadCredentials } from "../credentials/store";
import { protectedProcedure } from "../index";
import { uuidv7 } from "../lib/uuidv7";

export const conversationRouter = {
  /** Starts an empty Conversation; the first Message is sent through `/api/chat`. */
  create: protectedProcedure
    .input(z.object({ model: z.string() }))
    .handler(async ({ context, input }) => {
      if (!(await resolveModel(context.deps, context.session.user.id, input.model))) {
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

  /** A manual rename from the top bar. Doesn't bump `lastMessageAt`. */
  rename: protectedProcedure
    .input(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200) }))
    .handler(async ({ context, input }) => {
      const renamed = await renameConversation(
        context.deps,
        context.session.user.id,
        input.id,
        input.title,
      );
      if (!renamed) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),

  /** Selects the Model the next Message and regenerate use. Doesn't bump `lastMessageAt`. */
  setModel: protectedProcedure
    .input(z.object({ id: z.uuid(), model: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      if (!(await findConversation(context.deps, userId, input.id))) {
        throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
      }
      const model = await resolveModel(context.deps, userId, input.model);
      if (!model) {
        throw new ORPCError("BAD_REQUEST", {
          message: `"${input.model}" is not an available Model`,
        });
      }
      if (!(await loadCredentials(context.deps, userId, model.provider))) {
        throw new ORPCError("BAD_REQUEST", { message: addKeyMessage(model.provider) });
      }
      const updated = await setConversationModel(context.deps, userId, input.id, model.id);
      if (!updated) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),

  /** Deletes the Conversation for good; its Messages go with it (cascade). */
  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const deleted = await deleteConversation(context.deps, context.session.user.id, input.id);
      if (!deleted) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),
};
