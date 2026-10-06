import { conversation, message, type MessageRow } from "@ai-chat/db/schema/chat";
import { and, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../deps";
import { parseStoredParts, toUIParts } from "./parts";

type Deps = Pick<AppDeps, "db">;

/** The user's Conversation, or `undefined` when it doesn't exist or belongs to someone else. */
export async function findConversation(deps: Deps, userId: string, id: string) {
  const [row] = await deps.db
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)));
  return row;
}

/** How much of the Active Branch's last Message the Conversation panel previews. */
const previewLength = 160;

/**
 * The user's Conversations for the Conversation panel, newest Message first, each with a one-line
 * preview of its Active Branch's last Message and whether that Message ended in an error.
 */
export async function listConversations(deps: Deps, userId: string) {
  const rows = await deps.db
    .select({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      lastMessageAt: conversation.lastMessageAt,
      preview: sql<string | null>`left(${message.searchText}, ${previewLength})`,
      lastStatus: message.status,
    })
    .from(conversation)
    .leftJoin(message, eq(message.id, conversation.activeLeafId))
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.lastMessageAt), desc(conversation.id));
  return rows.map(({ preview, lastStatus, ...row }) => ({
    ...row,
    preview: (preview ?? "").replace(/\s+/g, " ").trim(),
    hasError: lastStatus === "error",
  }));
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
