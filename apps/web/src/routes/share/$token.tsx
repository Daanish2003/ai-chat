import type { SharedConversation } from "@ai-chat/api/share/store";
import { ORPCError } from "@orpc/client";
import type { UIMessage } from "@tanstack/ai-react";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { MessageRow } from "@/components/chat/message-row";
import type { MessageInfo } from "@/lib/chat";
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
  component: SharedConversationPage,
  notFoundComponent: SharedLinkNotFound,
});

function toUIMessages(messages: SharedConversation["messages"]): UIMessage[] {
  return messages.map(({ id, role, parts, createdAt, model, status }) => ({
    id,
    role,
    parts: parts as UIMessage["parts"],
    createdAt,
    metadata: { model, status, error: null, errorReason: null } satisfies MessageInfo,
  }));
}

function SharedConversationPage() {
  const shared = Route.useLoaderData();

  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="border-b px-4 py-2 text-xs text-muted-foreground">
        ai-chat · shared Conversation
      </header>
      <article className="mx-auto max-w-4xl py-8">
        <div className="px-6 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{shared.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared{" "}
            <time dateTime={shared.sharedAt.toISOString()}>
              {shared.sharedAt.toLocaleDateString(undefined, { dateStyle: "long" })}
            </time>
          </p>
        </div>
        <div className="border-t">
          {toUIMessages(shared.messages).map((message) => (
            <MessageRow key={message.id} message={message} userLabel="User" />
          ))}
        </div>
        <footer className="mt-12 text-center text-xs text-muted-foreground">
          Read-only snapshot. Attachments aren't shared.
        </footer>
      </article>
    </div>
  );
}

function SharedLinkNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-sm font-medium">404: Shared link not found</h1>
      <p className="text-xs text-muted-foreground">
        This link doesn't exist, or its owner deleted it.
      </p>
    </div>
  );
}
