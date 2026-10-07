import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import {
  deleteSharedLink,
  loadSharedConversation,
  shareStatus,
  upsertSharedLink,
} from "../share/store";

const forConversation = z.object({ conversationId: z.uuid() });

const blockedMessages = {
  empty: "There's nothing to share yet",
  streaming: "Wait for the reply to finish before sharing",
  error: "The newest reply ended in an error",
} as const;

function conversationNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Conversation not found" });
}

/** Shared links (ADR 0004). Only `get` is public; the rest are for the Conversation's owner. */
export const shareRouter = {
  /** Creates the link, or moves it to the current Active Branch under the same token. */
  upsert: protectedProcedure.input(forConversation).handler(async ({ context, input }) => {
    const result = await upsertSharedLink(
      context.deps,
      context.session.user.id,
      input.conversationId,
    );
    if (result.error === "not_found") throw conversationNotFound();
    if (result.error === "blocked") {
      throw new ORPCError("CONFLICT", { message: blockedMessages[result.blockedBy] });
    }
    return result.link;
  }),

  /** Revokes the link; its URL then answers 404. */
  delete: protectedProcedure.input(forConversation).handler(async ({ context, input }) => {
    const owned = await deleteSharedLink(
      context.deps,
      context.session.user.id,
      input.conversationId,
    );
    if (!owned) throw conversationNotFound();
  }),

  /** The share dialog's state: the link, whether it's stale, and why sharing is blocked. */
  forConversation: protectedProcedure.input(forConversation).handler(async ({ context, input }) => {
    const status = await shareStatus(context.deps, context.session.user.id, input.conversationId);
    if (!status) throw conversationNotFound();
    return status;
  }),

  /** The public, read-only page for a token. */
  get: publicProcedure
    .input(z.object({ token: z.string().max(64) }))
    .handler(async ({ context, input }) => {
      const shared = await loadSharedConversation(context.deps, input.token);
      if (!shared) throw new ORPCError("NOT_FOUND", { message: "Shared link not found" });
      return shared;
    }),
};
