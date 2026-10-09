import { minSearchLength } from "@ai-chat/api/shared/search/text";
import { relativeTime } from "@ai-chat/chat-core/relative-time";
import { recentConversations, type SearchHit, splitSnippet } from "@ai-chat/chat-core/search";
import { Dialog, DialogContent, DialogTitle } from "@ai-chat/ui/components/dialog";
import { cn } from "@ai-chat/ui/lib/utils";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRoundIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
  Share2Icon,
  TextSearchIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { invalidateConversationList } from "../conversation-list";
import { useDeleteConversation } from "../delete-conversation";
import { useChatAdapter, useChatLocation, useOrpc } from "../provider";
import { ShareDialog } from "../share/share-dialog";

/** How long typing must pause before Messages are searched. */
const searchDebounceMs = 250;

type Item = {
  key: string;
  group: "Recent" | "Conversations" | "In Messages" | "Commands";
  icon: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  hint?: string;
  danger?: boolean;
  /** Runs the item; the palette closes afterwards unless it returns `"stay"`. */
  run: () => "stay" | void;
};

/**
 * The ⌘K / Ctrl+K palette: Recent Conversations (filtered by title), hits In Messages (every
 * Branch, 2+ characters, debounced) and Commands. ↑/↓ move, Enter runs, Esc closes.
 * Also owns the Share dialog its "Share…" command opens.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { conversationId } = useChatLocation();
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-[15vh] flex max-h-[70vh] translate-y-0 flex-col gap-0 p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          {open && (
            <PaletteBody
              conversationId={conversationId}
              onClose={() => onOpenChange(false)}
              onShare={() => setShareOpen(true)}
            />
          )}
        </DialogContent>
      </Dialog>
      {conversationId && (
        <ShareDialog
          key={conversationId}
          conversationId={conversationId}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
    </>
  );
}

function PaletteBody({
  conversationId,
  onClose,
  onShare,
}: {
  conversationId: string | undefined;
  onClose: () => void;
  onShare: () => void;
}) {
  const { orpc, navigate } = useChatAdapter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const conversations = useQuery(orpc.conversation.list.queryOptions());
  const current = conversations.data?.find((c) => c.id === conversationId);
  const remove = useDeleteConversation();
  const searched = useDebounced(q.trim(), searchDebounceMs);
  const search = useInfiniteQuery(
    orpc.search.query.infiniteOptions({
      input: (cursor: string | undefined) => ({ q: searched, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled: searched.length >= minSearchLength,
    }),
  );
  const hits =
    searched.length >= minSearchLength
      ? (search.data?.pages.flatMap((page) => page.hits) ?? [])
      : [];

  const recent: Item[] = recentConversations(conversations.data ?? [], q).map((c) => ({
    key: `conversation:${c.id}`,
    group: q.trim() ? "Conversations" : "Recent",
    icon: <MessageSquareIcon />,
    label: c.title ?? <i>Untitled</i>,
    hint: relativeTime(c.lastMessageAt),
    run: () => void navigate({ to: "conversation", id: c.id }),
  }));
  const openHit = (hit: SearchHit) =>
    navigate({ to: "conversation", id: hit.conversationId, message: hit.messageId });

  const inMessages: Item[] = hits.map((hit) => ({
    key: `message:${hit.messageId}`,
    group: "In Messages",
    icon: <TextSearchIcon />,
    label: hit.conversationTitle ?? <i>Untitled</i>,
    detail: <Snippet snippet={hit.snippet} />,
    hint: relativeTime(hit.createdAt),
    run: () => void openHit(hit),
  }));
  if (search.hasNextPage) {
    inMessages.push({
      key: "message:more",
      group: "In Messages",
      icon: <TextSearchIcon />,
      label: search.isFetchingNextPage ? "Loading…" : "More results",
      run: () => {
        void search.fetchNextPage();
        return "stay";
      },
    });
  }

  const commands: Item[] = [
    {
      key: "new",
      group: "Commands" as const,
      icon: <PlusIcon />,
      label: "New Conversation",
      run: () => void navigate({ to: "new" }),
    },
    ...(current
      ? [
          {
            key: "rename",
            group: "Commands" as const,
            icon: <PencilIcon />,
            label: "Rename this Conversation",
            run: () => {
              setRenaming(true);
              return "stay" as const;
            },
          },
          {
            key: "share",
            group: "Commands" as const,
            icon: <Share2Icon />,
            label: current.shared ? "Shared link…" : "Share…",
            run: onShare,
          },
          {
            key: "delete",
            group: "Commands" as const,
            icon: <Trash2Icon />,
            label: "Delete this Conversation",
            danger: true,
            run: () => remove.confirmDelete(current),
          },
        ]
      : []),
    {
      key: "keys",
      group: "Commands" as const,
      icon: <KeyRoundIcon />,
      label: "Keys & settings",
      run: () => void navigate({ to: "keys" }),
    },
  ].filter((command) => command.label.toLowerCase().includes(q.trim().toLowerCase()));

  const items = [...recent, ...inMessages, ...commands];
  const activeIndex = Math.min(active, items.length - 1);
  const activeKey = items[activeIndex]?.key;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  const runItem = (item: Item | undefined) => {
    if (item && item.run() !== "stay") onClose();
  };

  if (renaming && current) {
    return <RenameInput conversation={current} onDone={onClose} />;
  }

  const searching = searched.length >= minSearchLength && search.isPending;
  return (
    <>
      <input
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls="palette-list"
        aria-activedescendant={activeKey ? optionId(activeKey) : undefined}
        aria-label="Search Conversations, Messages and commands"
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(activeIndex + 1, items.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            runItem(items[activeIndex]);
          }
        }}
        placeholder="Jump to a Conversation, search Messages, or run a command…"
        className="h-12 w-full shrink-0 border-b bg-transparent px-4 text-sm outline-none"
      />
      <div
        ref={listRef}
        id="palette-list"
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 overflow-y-auto py-1"
      >
        {groupsOf(items).map(([group, groupItems]) => (
          <div key={group} role="group" aria-label={group} className="p-1">
            <div className="px-3 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {group}
            </div>
            {groupItems.map((item) => (
              <div
                key={item.key}
                id={optionId(item.key)}
                role="option"
                aria-selected={item.key === activeKey}
                onMouseMove={() => setActive(items.indexOf(item))}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runItem(item)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-xs [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                  item.key === activeKey && "bg-muted",
                  item.danger && "text-destructive",
                )}
              >
                {item.icon}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">{item.label}</span>
                  {item.detail}
                </span>
                {item.hint && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{item.hint}</span>
                )}
              </div>
            ))}
          </div>
        ))}
        {searching && <p className="px-4 py-2 text-xs text-muted-foreground">Searching…</p>}
        {items.length === 0 && !searching && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No matches</p>
        )}
      </div>
      <div className="flex shrink-0 gap-3 border-t px-4 py-2 text-[10px] text-muted-foreground">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </>
  );
}

/** The plain-text snippet with its match in `<mark>`; never rendered as markdown or HTML. */
function Snippet({ snippet }: { snippet: SearchHit["snippet"] }) {
  const { before, match, after } = splitSnippet(snippet);
  return (
    <span className="line-clamp-2 text-muted-foreground">
      {before}
      <mark className="bg-primary/30 text-foreground">{match}</mark>
      {after}
    </span>
  );
}

/** Renames the open Conversation from the palette; Enter saves, Esc cancels. */
function RenameInput({
  conversation,
  onDone,
}: {
  conversation: { id: string; title: string | null };
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const orpc = useOrpc();
  const rename = useMutation(
    orpc.conversation.rename.mutationOptions({
      onSuccess: (_, { id, title }) => {
        queryClient.setQueryData(
          orpc.conversation.get.queryKey({ input: { id } }),
          (old) => old && { ...old, title },
        );
        void invalidateConversationList(queryClient, orpc);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <input
      autoFocus
      aria-label="New title"
      placeholder="New title"
      maxLength={200}
      defaultValue={conversation.title ?? ""}
      className="h-12 w-full bg-transparent px-4 text-sm outline-none"
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const title = event.currentTarget.value.trim();
        if (title && title !== conversation.title) rename.mutate({ id: conversation.id, title });
        onDone();
      }}
    />
  );
}

function optionId(key: string) {
  return `palette-option-${key.replace(/[^\w-]/g, "-")}`;
}

/** Items grouped in order of first appearance. */
function groupsOf(items: Item[]) {
  const groups = new Map<Item["group"], Item[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups];
}

function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
