import { and, eq, inArray } from "drizzle-orm";

import { stopRun } from "./chat/run";
import { attachment, attachmentBlob } from "./db/schema/attachment";
import { conversation, message } from "./db/schema/chat";
import { userCredentials } from "./db/schema/credentials";
import { userSettings } from "./db/schema/settings";
import type { AppDeps } from "./deps";

/**
 * Deletes everything the SDK holds for a user, in one transaction (spec #70). The Host calls it
 * when it deletes the user, and calling it again, or for an unknown id, does nothing. (drift)
 *
 * Order matters: Runs stop first so their owners write nothing more; Conversations go before
 * Attachments, because a Message's link to an Attachment does not cascade.
 */
export async function deleteUserData(deps: AppDeps, userId: string): Promise<void> {
  await deps.db.transaction(async (tx) => {
    // 1. Stop the user's live Runs through the Stop path. The Run's owner aborts and, its row gone,
    // its later writes match nothing.
    const live = await tx
      .select({ id: message.id })
      .from(message)
      .innerJoin(conversation, eq(conversation.id, message.conversationId))
      .where(and(eq(conversation.userId, userId), eq(message.status, "streaming")));
    for (const { id } of live) await stopRun(deps, id, tx);

    // 2. Conversations, which cascade to their Messages, Shared links and Message–Attachment links.
    await tx.delete(conversation).where(eq(conversation.userId, userId));

    // 3. Attachments and their bytes. The bytes live in Postgres, so they go with their rows. There
    // is no external blob store yet: an external one would delete its objects here, best-effort,
    // after the commit.
    const ownAttachments = tx
      .select({ id: attachment.id })
      .from(attachment)
      .where(eq(attachment.userId, userId));
    await tx.delete(attachmentBlob).where(inArray(attachmentBlob.attachmentId, ownAttachments));
    await tx.delete(attachment).where(eq(attachment.userId, userId));

    // 4. Credentials and settings.
    await tx.delete(userCredentials).where(eq(userCredentials.userId, userId));
    await tx.delete(userSettings).where(eq(userSettings.userId, userId));
  });
}
