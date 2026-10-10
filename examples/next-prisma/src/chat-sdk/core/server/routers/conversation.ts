import { conversation } from "../db/schema/chat";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { resolveModel } from "../chat/available-models";
import {
  deleteConversation,
  findConversation,
  listConversations,
  loadActiveBranch,
  renameConversation,
  setConversationModel,
  switchBranch,
} from "../chat/store";
import { unusableModelMessage } from "../../shared/credentials/services";
import { resolveModelCall } from "../credentials/resolve";
import { protectedProcedure } from "../procedures";
import { uuidv7 } from "../lib/uuidv7";

export const conversationRouter = {
  /** Starts an empty Conversation; the first Message is sent through `/api/chat`. */
  create: protectedProcedure
    .input(z.object({ model: z.string() }))
    .handler(async ({ context, input }) => {
      if (!(await resolveModel(context.deps, context.user.id, input.model))) {
        throw new ORPCError("BAD_REQUEST", {
          message: `"${input.model}" is not an available Model`,
        });
      }
      const id = uuidv7();
      await context.deps.db
        .insert(conversation)
        .values({ id, userId: context.user.id, model: input.model });
      return { id };
    }),

  /** The caller's Conversations for the Conversation panel, newest Message first. */
  list: protectedProcedure.handler(({ context }) =>
    listConversations(context.deps, context.user.id),
  ),

  /** The Conversation with its Active Branch, oldest Message first. */
  get: protectedProcedure.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
    const row = await findConversation(context.deps, context.user.id, input.id);
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    const messages = await loadActiveBranch(context.deps, row.id, row.activeLeafId);
    return {
      id: row.id,
      title: row.title,
      model: row.model,
      messages,
    };
  }),

  /**
   * Shows the Branch through `messageId`: the newest leaf under it becomes the Active Branch.
   * Doesn't bump `lastMessageAt`. CONFLICT while a reply is streaming.
   */
  switchBranch: protectedProcedure
    .input(z.object({ messageId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const result = await switchBranch(context.deps, context.user.id, input.messageId);
      if (result === "not_found")
        throw new ORPCError("NOT_FOUND", { message: "Message not found" });
      if (result === "streaming") {
        throw new ORPCError("CONFLICT", {
          message: "A reply is still streaming in this Conversation",
        });
      }
    }),

  /** A manual rename from the top bar. Doesn't bump `lastMessageAt`. */
  rename: protectedProcedure
    .input(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200) }))
    .handler(async ({ context, input }) => {
      const renamed = await renameConversation(
        context.deps,
        context.user.id,
        input.id,
        input.title,
      );
      if (!renamed) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),

  /** Selects the Model the next Message and regenerate use. Doesn't bump `lastMessageAt`. */
  setModel: protectedProcedure
    .input(z.object({ id: z.uuid(), model: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.user.id;
      if (!(await findConversation(context.deps, userId, input.id))) {
        throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
      }
      const model = await resolveModel(context.deps, userId, input.model);
      if (!model) {
        throw new ORPCError("BAD_REQUEST", {
          message: `"${input.model}" is not an available Model`,
        });
      }
      if (!(await resolveModelCall(context.deps, userId, model.id))) {
        throw new ORPCError("BAD_REQUEST", {
          message: unusableModelMessage(model.provider, context.deps.byok),
        });
      }
      const updated = await setConversationModel(context.deps, userId, input.id, model.id);
      if (!updated) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),

  /** Deletes the Conversation for good; its Messages go with it (cascade). */
  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const deleted = await deleteConversation(context.deps, context.user.id, input.id);
      if (!deleted) throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
    }),
};
