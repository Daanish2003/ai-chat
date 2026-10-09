import { handleChat, handleJoin } from "@ai-chat/chat-sdk/server";
import { createFileRoute } from "@tanstack/react-router";

import { auth, deps } from "../../services";

/**
 * Streams an assistant Message, and joins a live one (`GET ?runId=`). Thin wrappers: everything
 * happens in `handleChat` and `handleJoin` (ADR 0002, ADR 0006).
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        return handleChat(request, session, deps);
      },
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        return handleJoin(request, session, deps);
      },
    },
  },
});
