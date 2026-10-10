import type { AppRouterClient } from "../../core/server/routers/index";
import { groupByDate } from "../../core/client/date-groups";
import { modelLabel } from "../../core/client/models";
import { relativeTime } from "../../core/client/relative-time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Share2Icon, Trash2Icon } from "lucide-react";
import { useEffect, useRef } from "react";

import { useDeleteConversation } from "../../core/client/react/delete-conversation";
import { useChatAdapter, useOrpc } from "../../core/client/react/provider";
import { ProjectsSection } from "./projects-section";

export type ConversationSummary = Awaited<
  ReturnType<AppRouterClient["conversation"]["list"]>
>["items"][number];

/** The user's Conversations outside Projects, newest Message first, grouped by date. */
export function ConversationPanel({ className }: { className?: string }) {
  const orpc = useOrpc();
  const conversations = useInfiniteQuery(
    orpc.conversation.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );
  const rows = conversations.data?.pages.flatMap((page) => page.items) ?? [];
  const groups = groupByDate(rows, (row) => row.lastMessageAt);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = conversations;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Loads the next page once the end of the list scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <aside
      aria-label="Conversations"
      className={cn("flex w-72 shrink-0 flex-col border-r bg-sidebar/50", className)}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-xs font-medium">Conversations</span>
        <span className="text-[10px] text-muted-foreground">{rows.length}</span>
      </div>
      {conversations.isSuccess && rows.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No Conversations yet</p>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <ProjectsSection />
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="sticky top-0 z-10 bg-sidebar/95 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
              {group.label}
            </h3>
            <ul>
              {group.rows.map((row) => (
                <ConversationRow key={row.id} conversation={row} />
              ))}
            </ul>
          </section>
        ))}
        <div ref={sentinelRef} />
        {isFetchingNextPage && (
          <p className="px-3 py-2 text-center text-[10px] text-muted-foreground">Loading…</p>
        )}
      </div>
    </aside>
  );
}

/** One Conversation in a list: its title, preview and Model, with a delete button. */
export function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const title = conversation.title ?? "Untitled";
  const remove = useDeleteConversation();
  const { Link } = useChatAdapter();

  return (
    <li className="group relative border-b">
      <Link
        page={{ to: "conversation", id: conversation.id }}
        className="block border-l-2 border-l-transparent px-3 py-2 hover:bg-sidebar-accent"
        activeClassName="border-l-primary bg-sidebar-accent"
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-xs font-medium">
            {conversation.title ?? <i className="text-muted-foreground">Untitled</i>}
          </span>
          <time
            dateTime={conversation.lastMessageAt.toISOString()}
            className="text-[10px] text-muted-foreground group-focus-within:invisible group-hover:invisible pointer-coarse:visible"
          >
            {relativeTime(conversation.lastMessageAt)}
          </time>
        </div>
        <p className="mt-0.5 line-clamp-1 min-h-4 text-[11px] text-muted-foreground">
          {conversation.preview}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="truncate">{modelLabel(conversation.model)}</span>
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
        className="absolute top-1.5 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive pointer-coarse:top-auto pointer-coarse:bottom-1.5 pointer-coarse:opacity-100"
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}
