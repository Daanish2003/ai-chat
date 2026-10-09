import type { SharedConversation } from "@ai-chat/api/shared/share/conversation";
import { sharedToUIMessages } from "@ai-chat/chat-core/chat";

import { MessageRow } from "../chat/message-row";

/** A Shared link's public, read-only page, outside the signed-in layout (ADR 0004). */
export function SharedConversationPage({ shared }: { shared: SharedConversation }) {
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
          {sharedToUIMessages(shared.messages).map((message) => (
            <MessageRow key={message.id} message={message} userLabel="User" />
          ))}
        </div>
        <footer className="mt-12 text-center text-xs text-muted-foreground">
          Read-only snapshot. Attachments show as file names only; their contents aren't shared.
        </footer>
      </article>
    </div>
  );
}

export function SharedLinkNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-sm font-medium">404: Shared link not found</h1>
      <p className="text-xs text-muted-foreground">
        This link doesn't exist, or its owner deleted it.
      </p>
    </div>
  );
}
