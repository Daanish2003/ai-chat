import { attachment, attachmentBlob, messageAttachment } from "@ai-chat/db/schema/attachment";
import { and, asc, eq, inArray, lt, notExists } from "drizzle-orm";

import type { AppDeps } from "../deps";
import { uuidv7 } from "../lib/uuidv7";

/**
 * The attachment store: every read and write of attachments goes through here (ADR 0001).
 * Metadata and bytes are in separate tables, so only `loadAttachmentBytes` ever reads bytes.
 */

type Db = AppDeps["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Deps = Pick<AppDeps, "db">;

/** What the client and the Shared link see of an attachment: never its bytes. */
export type AttachmentInfo = { id: string; filename: string; mediaType: string; size: number };

const infoColumns = {
  id: attachment.id,
  filename: attachment.filename,
  mediaType: attachment.mediaType,
  size: attachment.size,
};

/** How long an attachment no Message uses is kept before an upload deletes it. */
const orphanAgeMs = 24 * 60 * 60 * 1000;

/** Stores an uploaded file for `userId`, first deleting orphans older than 24 hours. */
export async function saveAttachment(
  deps: Deps,
  userId: string,
  file: { filename: string; mediaType: string; bytes: Uint8Array },
): Promise<AttachmentInfo> {
  const now = new Date();
  await deleteOrphanAttachments(deps, new Date(now.getTime() - orphanAgeMs));
  const id = uuidv7();
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attachment)
      .values({
        id,
        userId,
        filename: file.filename,
        mediaType: file.mediaType,
        size: file.bytes.byteLength,
        createdAt: now,
      })
      .returning(infoColumns);
    if (!row) throw new Error("Saving the attachment returned no row");
    await tx.insert(attachmentBlob).values({ attachmentId: id, bytes: Buffer.from(file.bytes) });
    return row;
  });
}

/**
 * Deletes attachments created before `before` that no Message uses; their bytes go with them.
 * Skips attachments a send has locked (`lockAttachments`), which are about to be linked.
 */
export async function deleteOrphanAttachments(deps: Deps, before: Date) {
  const orphans = deps.db
    .select({ id: attachment.id })
    .from(attachment)
    .where(
      and(
        lt(attachment.createdAt, before),
        notExists(
          deps.db
            .select({ id: messageAttachment.attachmentId })
            .from(messageAttachment)
            .where(eq(messageAttachment.attachmentId, attachment.id)),
        ),
      ),
    )
    .for("update", { skipLocked: true });
  await deps.db.delete(attachment).where(inArray(attachment.id, orphans));
}

/**
 * Locks the user's attachments against the orphan cleanup for the rest of the send's
 * transaction; `false` when one is gone (deleted, or never theirs).
 */
export async function lockAttachments(tx: Tx, userId: string, ids: string[]) {
  if (ids.length === 0) return true;
  const rows = await tx
    .select({ id: attachment.id })
    .from(attachment)
    .where(and(inArray(attachment.id, ids), eq(attachment.userId, userId)))
    .for("key share");
  return rows.length === ids.length;
}

/** The ones of `ids` that `userId` uploaded, in the order of `ids`. */
export async function findOwnedAttachments(
  deps: Deps,
  userId: string,
  ids: string[],
): Promise<AttachmentInfo[]> {
  if (ids.length === 0) return [];
  const rows = await deps.db
    .select(infoColumns)
    .from(attachment)
    .where(and(inArray(attachment.id, ids), eq(attachment.userId, userId)));
  return ids.flatMap((id) => rows.filter((row) => row.id === id));
}

/** Each Message's attachments, in order; Messages without any are missing from the map. */
export async function attachmentsOfMessages(
  deps: Deps,
  messageIds: string[],
): Promise<Map<string, AttachmentInfo[]>> {
  const byMessage = new Map<string, AttachmentInfo[]>();
  if (messageIds.length === 0) return byMessage;
  const rows = await deps.db
    .select({ messageId: messageAttachment.messageId, ...infoColumns })
    .from(messageAttachment)
    .innerJoin(attachment, eq(attachment.id, messageAttachment.attachmentId))
    .where(inArray(messageAttachment.messageId, messageIds))
    .orderBy(asc(messageAttachment.position));
  for (const { messageId, ...info } of rows) {
    byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), info]);
  }
  return byMessage;
}

/** The bytes of each attachment, by id. */
export async function loadAttachmentBytes(
  deps: Deps,
  ids: string[],
): Promise<Map<string, Uint8Array>> {
  if (ids.length === 0) return new Map();
  const rows = await deps.db
    .select()
    .from(attachmentBlob)
    .where(inArray(attachmentBlob.attachmentId, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.attachmentId, row.bytes]));
}

/** Links attachments to a new Message, in order. */
export async function linkAttachments(tx: Tx, messageId: string, attachmentIds: string[]) {
  if (attachmentIds.length === 0) return;
  await tx
    .insert(messageAttachment)
    .values(attachmentIds.map((attachmentId, position) => ({ messageId, attachmentId, position })));
}
