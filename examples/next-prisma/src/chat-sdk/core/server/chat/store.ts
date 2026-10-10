import { conversation, message, type MessageRow } from "../db/schema/chat";
import { sharedLink } from "../db/schema/share";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { attachmentsOfMessages } from "../attachments/store";
import type { AppDeps } from "../deps";
import { newestLeaf, pathTo, siblingPosition } from "../../shared/chat/branches";
import { type ActiveBranchMessage, toClientMessage } from "../../shared/chat/client-message";
import type { ReasoningChoice } from "../../shared/chat/models";

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

/** Selects the user's Conversation's Model; `false` when it isn't theirs. Doesn't bump `lastMessageAt`. */
export async function setConversationModel(deps: Deps, userId: string, id: string, model: string) {
  const rows = await deps.db
    .update(conversation)
    .set({ model })
    .where(ownConversation(userId, id))
    .returning({ id: conversation.id });
  return rows.length > 0;
}

/** Sets the user's Conversation's reasoning effort (`null` for the Model's default); `false` when it isn't theirs. */
export async function setConversationReasoningEffort(
  deps: Deps,
  userId: string,
  id: string,
  reasoningEffort: ReasoningChoice | null,
) {
  const rows = await deps.db
    .update(conversation)
    .set({ reasoningEffort })
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

/** Conversations per page of the main Conversation list. */
export const conversationPageSize = 50;

/**
 * Where the next page starts: the last row's `lastMessageAt` as Postgres prints it (full
 * precision, which a JS `Date` would lose) and its id.
 */
const conversationCursorShape = z.object({
  lastMessageAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/),
  id: z.uuid(),
});
type ConversationCursor = z.infer<typeof conversationCursorShape>;

function encodeConversationCursor(cursor: ConversationCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** The decoded cursor, or `undefined` when it isn't one this module wrote. */
export function decodeConversationCursor(cursor: string): ConversationCursor | undefined {
  try {
    return conversationCursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    return undefined;
  }
}

/**
 * One page of the user's Conversations that are in no Project, for the Conversation panel: newest
 * Message first, ties broken by id, `conversationPageSize` at a time. Each row has a one-line
 * preview of its Active Branch's last Message and whether that Message ended in an error. A reply
 * that hasn't written any text yet previews the Message it answers. `shared` says whether the
 * Conversation has a Shared link. Pass the previous page's `nextCursor` for the next one.
 */
export async function listConversations(deps: Deps, userId: string, cursor?: ConversationCursor) {
  const lastMessageAtText = sql<string>`${conversation.lastMessageAt}::text`;
  const rows = await deps.db
    .select({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      lastMessageAt: conversation.lastMessageAt,
      lastMessageAtText,
      pinnedAt: conversation.pinnedAt,
      projectId: conversation.projectId,
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
    .where(
      and(
        eq(conversation.userId, userId),
        isNull(conversation.projectId),
        cursor &&
          sql`(${conversation.lastMessageAt}, ${conversation.id}) < (${cursor.lastMessageAt}::timestamp, ${cursor.id}::uuid)`,
      ),
    )
    .orderBy(desc(conversation.lastMessageAt), desc(conversation.id))
    .limit(conversationPageSize + 1);

  const page = rows.slice(0, conversationPageSize);
  const last = page.at(-1);
  return {
    items: page.map(({ preview, lastStatus, lastMessageAtText: _text, ...row }) => ({
      ...row,
      preview: (preview ?? "").replace(/\s+/g, " ").trim(),
      hasError: lastStatus === "error",
    })),
    nextCursor:
      rows.length > conversationPageSize && last
        ? encodeConversationCursor({ lastMessageAt: last.lastMessageAtText, id: last.id })
        : null,
  };
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
  const path = pathTo(rows, leafId);
  const attachments = await attachmentsOfMessages(
    deps,
    path.map((row) => row.id),
  );
  return path.map((row) => ({
    ...toClientMessage(row, attachments.get(row.id)),
    siblings: siblingPosition(rows, row),
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
