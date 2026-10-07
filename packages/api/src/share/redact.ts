import type { MessagePart } from "@tanstack/ai";

/** The parts a Shared link viewer may see. Anything else (thinking, file contents) is left out. */
const sharedPartTypes = new Set<MessagePart["type"]>(["text", "tool-call", "tool-result"]);

/**
 * A Message's parts as a Shared link shows them (ADR 0004): an allowlist, so a part type added
 * later stays private until it is listed here. Attachments will come back as filename chips.
 */
export function redactForShare(parts: MessagePart[]): MessagePart[] {
  return parts.filter((part) => sharedPartTypes.has(part.type));
}
