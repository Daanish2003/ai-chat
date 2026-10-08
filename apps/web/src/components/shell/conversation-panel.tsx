import type { AppRouterClient } from "@ai-chat/api/routers/index";
import { findModel } from "@ai-chat/api/chat/models";
import { Button } from "@ai-chat/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Share2Icon, Trash2Icon } from "lucide-react";

import { useDeleteConversation } from "@/lib/delete-conversation";
import { relativeTime } from "@/lib/relative-time";
import { orpc } from "@/utils/orpc";

type ConversationSummary = Awaited<ReturnType<AppRouterClient["conversation"]["list"]>>[number];

/** The user's Conversations, newest Message first. */
export function ConversationPanel() {
  const conversations = useQuery(orpc.conversation.list.queryOptions());

  return (
    <aside
      aria-label="Conversations"
      className="flex w-72 shrink-0 flex-col border-r bg-sidebar/50"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-xs font-medium">Conversations</span>
        <span className="text-[10px] text-muted-foreground">{conversations.data?.length}</span>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {conversations.data?.map((row) => (
          <ConversationRow key={row.id} conversation={row} />
        ))}
      </ul>
      {conversations.data?.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No Conversations yet</p>
      )}
    </aside>
  );
}

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const title = conversation.title ?? "Untitled";
  const remove = useDeleteConversation();

  return (
    <li className="group relative border-b">
      <Link
        to="/c/$id"
        params={{ id: conversation.id }}
        className="block border-l-2 border-l-transparent px-3 py-2 hover:bg-sidebar-accent"
        activeProps={{ className: "border-l-primary bg-sidebar-accent" }}
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-xs font-medium">
            {conversation.title ?? <i className="text-muted-foreground">Untitled</i>}
          </span>
          <time
            dateTime={conversation.lastMessageAt.toISOString()}
            className="text-[10px] text-muted-foreground group-focus-within:invisible group-hover:invisible"
          >
            {relativeTime(conversation.lastMessageAt)}
          </time>
        </div>
        <p className="mt-0.5 line-clamp-1 min-h-4 text-[11px] text-muted-foreground">
          {conversation.preview}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{findModel(conversation.model)?.label ?? conversation.model}</span>
          {conversation.shared && (
            <Share2Icon aria-label="Shared" className="size-3 shrink-0 text-primary" />
          )}
          {conversation.hasError && <span className="text-destructive">error</span>}
        </div>
      </Link>
      <Button
        variant="ghost"
        size="icon-xs"
        title="Delete"
        aria-label={`Delete "${title}"`}
        disabled={remove.isPending}
        onClick={() => remove.confirmDelete(conversation)}
        className="absolute top-1.5 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}
