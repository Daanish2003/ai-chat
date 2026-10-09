import { SharedConversationPage, SharedLinkNotFound } from "@ai-chat/chat-sdk/ui";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { getSharedConversation } from "@/functions/get-shared-conversation";

const noindex = { name: "robots", content: "noindex, nofollow" };

type Snapshot = ComponentProps<typeof SharedConversationPage>["data"];

/** A Shared link's public, read-only page, outside the signed-in layout (ADR 0004). */
export const Route = createFileRoute("/share/$token")({
  loader: async ({ params }): Promise<Snapshot> => {
    const shared: Snapshot | null = await getSharedConversation({ data: params.token });
    if (!shared) throw notFound();
    return shared;
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
  return <SharedConversationPage data={Route.useLoaderData()} />;
}
