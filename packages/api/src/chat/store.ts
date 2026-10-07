import { conversation, message, type MessageRow } from "@ai-chat/db/schema/chat";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AppDeps } from "../deps";
import { type Branch, branchOf, newestLeaf, pathTo } from "./branches";
import { parseStoredParts, toUIParts } from "./parts";

type Deps = Pick<AppDeps, "db">;

/** Matches the Conversation `id` only when `userId` owns it. */
function ownConversation(userId: string, id: string) {
  return and(eq(conversation.id, id), eq(conversation.userId, userId));
}

/** The user's Conversation, or `undefined` when it doesn't exist or belongs to someone else. */
export async function findConversation(deps: Deps, userId: string, id: string) {
  const [row] = await deps.db.select().from(conversation).where(ownConversation(userId, id));
  return row;
}

/** Sets the user's Conversation title; `false` when it isn't theirs. Doesn't bump `lastMessageAt`. */
export async function renameConversation(deps: Deps, userId: string, id: string, title: string) {
  const rows = await deps.db
    .update(conversation)
    .set({ title })
    .where(ownConversation(userId, id))
    .returning({ id: conversation.id });
  return rows.length > 0;
}

/** Deletes the user's Conversation and, by cascade, its Messages; `false` when it isn't theirs. */
export async function deleteConversation(deps: Deps, userId: string, id: string) {
  const rows = await deps.db
    .delete(conversation)
    .where(ownConversation(userId, id))
    .returning({ id: conversation.id });
  return rows.length > 0;
}

/** How much of the Active Branch's last Message the Conversation panel previews. */
const previewLength = 160;

const leaf = alias(message, "leaf");
const leafParent = alias(message, "leaf_parent");

/**
 * The user's Conversations for the Conversation panel, newest Message first, each with a one-line
 * preview of its Active Branch's last Message and whether that Message ended in an error. A reply
 * that hasn't written any text yet previews the Message it answers.
 */
export async function listConversations(deps: Deps, userId: string) {
  const rows = await deps.db
    .select({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      lastMessageAt: conversation.lastMessageAt,
      preview: sql<
        string | null
      >`left(coalesce(nullif(${leaf.searchText}, ''), ${leafParent.searchText}), ${previewLength})`,
      lastStatus: leaf.status,
    })
    .from(conversation)
    .leftJoin(leaf, eq(leaf.id, conversation.activeLeafId))
    .leftJoin(leafParent, eq(leafParent.id, leaf.parentId))
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.lastMessageAt), desc(conversation.id));
  return rows.map(({ preview, lastStatus, ...row }) => ({
    ...row,
    preview: (preview ?? "").replace(/\s+/g, " ").trim(),
    hasError: lastStatus === "error",
  }));
}

/** The Message, or `undefined` when it doesn't exist or is in someone else's Conversation. */
export async function findMessage(deps: Deps, userId: string, id: string) {
  const [row] = await deps.db
    .select({ message })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(and(eq(message.id, id), eq(conversation.userId, userId)));
  return row?.message;
}

/** The Messages from a root down to `leafId`, oldest first. Empty without a leaf. */
export async function loadPath(
  deps: Deps,
  conversationId: string,
  leafId: string | null,
): Promise<MessageRow[]> {
  if (!leafId) return [];
  return pathTo(await loadMessages(deps, conversationId), leafId);
}

function loadMessages(deps: Deps, conversationId: string) {
  return deps.db.select().from(message).where(eq(message.conversationId, conversationId));
}

/** The Active Branch for the client, each Message with where it sits among its siblings. */
export async function loadActiveBranch(
  deps: Deps,
  conversationId: string,
  leafId: string | null,
): Promise<ActiveBranchMessage[]> {
  if (!leafId) return [];
  const rows = await loadMessages(deps, conversationId);
  return pathTo(rows, leafId).map((row) => ({
    ...toClientMessage(row),
    branch: branchOf(rows, row),
  }));
}

/**
 * Makes the newest leaf under the user's Message the Active Branch. Doesn't bump
 * `lastMessageAt`. Refused while a reply streams, like every other change to the Branch.
 */
export async function switchBranch(
  deps: Deps,
  userId: string,
  messageId: string,
): Promise<"switched" | "not_found" | "streaming"> {
  const target = await findMessage(deps, userId, messageId);
  if (!target) return "not_found";
  return deps.db.transaction(async (tx) => {
    // Queues behind a send's transaction, which holds the same lock (see `handleChat`).
    await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(eq(conversation.id, target.conversationId))
      .for("update");
    const nodes = await tx
      .select({
        id: message.id,
        parentId: message.parentId,
        createdAt: message.createdAt,
        status: message.status,
      })
      .from(message)
      .where(eq(message.conversationId, target.conversationId));
    if (nodes.some((node) => node.status === "streaming")) return "streaming";
    await tx
      .update(conversation)
      .set({ activeLeafId: newestLeaf(nodes, target.id) })
      .where(eq(conversation.id, target.conversationId));
    return "switched";
  });
}

/** A Message as the client sees it, with `useChat` parts. */
export function toClientMessage(row: MessageRow) {
  return {
    id: row.id,
    parentId: row.parentId,
    role: row.role,
    parts: toUIParts(parseStoredParts(row.parts)),
    model: row.model,
    status: row.status,
    error: row.error,
    errorReason: row.errorReason,
    createdAt: row.createdAt,
  };
}

export type ClientMessage = ReturnType<typeof toClientMessage>;

/** A Message of the Active Branch as `conversation.get` returns it, with its ‹ n/m › Branch. */
export type ActiveBranchMessage = ClientMessage & { branch: Branch };
