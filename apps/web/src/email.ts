import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCaptureMailbox,
  createConsoleSender,
  createResendSender,
  type EmailSender,
} from "@ai-chat/email";

import { ENV } from "./env.server";

const transport = ENV.EMAIL_TRANSPORT ?? (ENV.NODE_ENV === "production" ? "resend" : "console");

export const appName = ENV.APP_NAME ?? "AI Chat";
const from = ENV.EMAIL_FROM ?? "AI Chat <no-reply@example.com>";

// Kept in memory; only the test-only mailbox route reads it, and only when the transport is capture.
export const mailbox = createCaptureMailbox({ from });

export const sender: EmailSender = (() => {
  if (transport === "capture") return mailbox.sender;
  if (transport === "resend") {
    if (!ENV.RESEND_API_KEY) throw new Error("EMAIL_TRANSPORT=resend needs RESEND_API_KEY");
    return createResendSender({ apiKey: ENV.RESEND_API_KEY, from });
  }
  return createConsoleSender({ from, outDir: join(tmpdir(), "ai-chat-email-preview") });
})();

export const captureEnabled = transport === "capture";
