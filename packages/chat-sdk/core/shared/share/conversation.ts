import type { MessageRow } from "../../server/db/schema/chat";

import type { AttachmentInfo } from "../attachments/kinds";
import { parseStoredParts, toUIParts } from "../chat/parts";
import { redactAttachmentsForShare, redactForShare } from "./redact";

/**
 * What anyone with the token sees: the frozen title, the share date and the shared Branch, with
 * thinking and file contents stripped (attachments are filename chips) and no author or error details.
 */
export function toSharedConversation(
  link: { title: string; updatedAt: Date },
  path: MessageRow[],
  attachments: Map<string, AttachmentInfo[]>,
) {
  return {
    title: link.title,
    sharedAt: link.updatedAt,
    messages: path.map((row) => ({
      id: row.id,
      role: row.role,
      parts: redactForShare(toUIParts(parseStoredParts(row.parts))),
      attachments: redactAttachmentsForShare(attachments.get(row.id) ?? []),
      model: row.model,
      status: row.status,
      createdAt: row.createdAt,
    })),
  };
}

export type SharedConversation = ReturnType<typeof toSharedConversation>;
