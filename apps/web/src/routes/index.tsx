import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

/** No page of its own: signed in, a new Conversation; otherwise the login page. */
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    throw redirect({ to: (await getUser()) ? "/c" : "/login" });
  },
});
