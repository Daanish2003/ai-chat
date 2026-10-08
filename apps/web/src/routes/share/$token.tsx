import { SharedConversationPage, SharedLinkNotFound } from "@ai-chat/chat-react";
import { ORPCError } from "@orpc/client";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { client } from "@/utils/orpc";

const noindex = { name: "robots", content: "noindex, nofollow" };

/** A Shared link's public, read-only page, outside the signed-in layout (ADR 0004). */
export const Route = createFileRoute("/share/$token")({
  loader: async ({ params }) => {
    try {
      return await client.share.get({ token: params.token });
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      noindex,
      { title: loaderData ? `${loaderData.title} · ai-chat` : "Not found · ai-chat" },
    ],
  }),
  component: SharedLinkPage,
  notFoundComponent: SharedLinkNotFound,
});

function SharedLinkPage() {
  return <SharedConversationPage shared={Route.useLoaderData()} />;
}
