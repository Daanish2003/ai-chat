import { conversation, message, type MessageRow } from "@ai-chat/db/schema/chat";
import { sharedLink } from "@ai-chat/db/schema/share";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AppDeps } from "../deps";
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

/**
 * Deletes the user's Conversation and, by cascade, its Messages and Shared link; `false` when it
 * isn't theirs.
 */
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
 * `shared` says whether the Conversation has a Shared link.
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
      shared: sql<boolean>`${sharedLink.token} is not null`,
    })
    .from(conversation)
    .leftJoin(leaf, eq(leaf.id, conversation.activeLeafId))
    .leftJoin(leafParent, eq(leafParent.id, leaf.parentId))
    .leftJoin(sharedLink, eq(sharedLink.conversationId, conversation.id))
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
  const rows = await deps.db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: MessageRow[] = [];
  for (let row = byId.get(leafId); row; row = row.parentId ? byId.get(row.parentId) : undefined) {
    path.push(row);
  }
  return path.reverse();
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
