import { createFileRoute } from "@tanstack/react-router";

import { chat } from "../../../services";

/** The Chat SDK's handler: RPC calls, the Run POST and join GET, and the public Shared link read. */
const handle = ({ request }: { request: Request }) => chat.handler(request);

export const Route = createFileRoute("/api/chat/$")({
  server: {
    handlers: {
      HEAD: handle,
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
