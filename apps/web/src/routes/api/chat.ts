import { handleChat } from "@ai-chat/api/chat/handle-chat";
import { createFileRoute } from "@tanstack/react-router";

import { auth, deps } from "../../services";

/** Streams an assistant Message. A thin wrapper: everything happens in `handleChat` (ADR 0002). */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        return handleChat(request, session, deps);
      },
    },
  },
});
