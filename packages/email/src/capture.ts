import { createHash } from "node:crypto";

import { checkHeaders, type EmailMessage, type EmailSender } from "./sender";
import type { TemplateName } from "./templates";

// End-to-end sender: keeps each message for ten minutes so a test can read the
// link back through the test-only mailbox route. Messages are kept per
// recipient under a hash of the lowercased address, so no raw address is a key.
export const CAPTURE_TTL_MS = 10 * 60 * 1000;

export type CapturedMessage = {
  template: TemplateName;
  subject: string;
  text: string;
  sentAt: number;
};

export type CaptureMailbox = {
  sender: EmailSender;
  read(address: string): CapturedMessage[];
  // The hashed keys that hold live messages. For tests.
  keys(): string[];
};

function keyOf(address: string): string {
  return createHash("sha256").update(address.trim().toLowerCase()).digest("hex");
}

export function createCaptureMailbox({
  from,
  now = Date.now,
}: {
  from: string;
  now?: () => number;
}): CaptureMailbox {
  const boxes = new Map<string, CapturedMessage[]>();

  // Drops expired messages, and the boxes left empty by them.
  function prune(): void {
    const cutoff = now() - CAPTURE_TTL_MS;
    for (const [key, messages] of boxes) {
      const live = messages.filter((message) => message.sentAt > cutoff);
      if (live.length === 0) boxes.delete(key);
      else boxes.set(key, live);
    }
  }

  return {
    sender: {
      async send(message: EmailMessage) {
        checkHeaders(message, from);
        prune();
        const key = keyOf(message.to);
        const captured: CapturedMessage = {
          template: message.template,
          subject: message.subject,
          text: message.text,
          sentAt: now(),
        };
        boxes.set(key, [...(boxes.get(key) ?? []), captured]);
      },
    },
    read(address) {
      prune();
      return [...(boxes.get(keyOf(address)) ?? [])];
    },
    keys() {
      prune();
      return [...boxes.keys()];
    },
  };
}
