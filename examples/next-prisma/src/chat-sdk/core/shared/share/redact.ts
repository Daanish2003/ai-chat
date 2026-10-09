import type { MessagePart } from "@tanstack/ai";

import type { AttachmentInfo } from "../attachments/kinds";

/** The parts a Shared link viewer may see. Anything else (thinking, file contents) is left out. */
const sharedPartTypes = new Set<MessagePart["type"]>(["text", "tool-call", "tool-result"]);

/**
 * A Message's parts as a Shared link shows them (ADR 0004): an allowlist, so a part type added
 * later stays private until it is listed here. Attachments aren't parts; see
 * `redactAttachmentsForShare`.
 */
export function redactForShare(parts: MessagePart[]): MessagePart[] {
  return parts.filter((part) => sharedPartTypes.has(part.type));
}

/**
 * A Message's attachments as a Shared link shows them: filename-and-type chips only. Their bytes
 * are never served publicly (ADR 0004), and the id and size stay private too.
 */
export function redactAttachmentsForShare(attachments: AttachmentInfo[]) {
  return attachments.map(({ filename, mediaType }) => ({ filename, mediaType }));
}
