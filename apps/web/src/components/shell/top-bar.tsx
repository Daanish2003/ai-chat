import { Button } from "@ai-chat/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "@tanstack/react-router";
import { PanelLeftIcon, PencilIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { invalidateConversationList } from "@/lib/conversation-list";
import { missingCredentialsMessage } from "@/lib/models";
import { useNewConversationModel } from "@/lib/new-conversation-model";
import { orpc } from "@/utils/orpc";

import { ShareButton } from "../share/share-dialog";
import UserMenu from "../user-menu";
import { ModelPicker } from "./model-picker";

const pageTitles: Record<string, string> = {
  "/c": "New Conversation",
  "/settings/keys": "Keys & settings",
  "/dashboard": "Dashboard",
};

/** The bar above the page: the Conversation title (renamed inline) or the page's name. */
export function TopBar({
  panelOpen,
  onOpenPanel,
  onOpenSearch,
}: {
  panelOpen: boolean;
  onOpenPanel: () => void;
  /** Opens the ⌘K palette. */
  onOpenSearch: () => void;
}) {
  const { id } = useParams({ strict: false });
  const pathname = useLocation({ select: (location) => location.pathname.replace(/\/$/, "") });

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
      {!panelOpen && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show Conversations"
          onClick={onOpenPanel}
        >
          <PanelLeftIcon />
        </Button>
      )}
      {id ? (
        <ConversationTitle key={id} id={id} />
      ) : (
        <span className="px-2 text-sm text-muted-foreground">{pageTitles[pathname]}</span>
      )}
      {(id || pathname === "/c") && <span className="text-muted-foreground">/</span>}
      {id ? (
        <ConversationModelPicker key={id} id={id} />
      ) : (
        pathname === "/c" && <NewConversationModelPicker />
      )}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        title="Search (⌘K / Ctrl+K)"
        onClick={onOpenSearch}
      >
        <SearchIcon /> Search
        <kbd className="border px-1 text-[10px] text-muted-foreground">⌘K</kbd>
      </Button>
      {id && <ShareButton key={id} conversationId={id} />}
      <UserMenu />
    </header>
  );
}

/** Switches the open Conversation's Model; the next Message and regenerate use it. */
function ConversationModelPicker({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const conversation = useQuery(orpc.conversation.get.queryOptions({ input: { id } }));
  const models = useQuery(orpc.models.list.queryOptions());
  const getKey = orpc.conversation.get.queryKey({ input: { id } });
  const setModel = useMutation(
    orpc.conversation.setModel.mutationOptions({
      onMutate: ({ model }) => {
        const previous = conversation.data?.model;
        queryClient.setQueryData(getKey, (old) => old && { ...old, model });
        return { previous };
      },
      onSuccess: () => void invalidateConversationList(queryClient),
      onError: (error, _, context) => {
        const previous = context?.previous;
        if (previous) queryClient.setQueryData(getKey, (old) => old && { ...old, model: previous });
        toast.error(error.message);
      },
      // A refetch already in flight (polling, a run ending) may have overwritten the optimistic
      // Model. Not cancelled: the chat view awaits those fetches.
      onSettled: () => queryClient.invalidateQueries({ queryKey: getKey }),
    }),
  );
  const value = conversation.data?.model;

  if (!value || !models.data) return null;
  return (
    <ModelPicker
      value={value}
      models={models.data.models}
      invalid={missingCredentialsMessage(value, models.data.models) !== null}
      onSelect={(model) => setModel.mutate({ id, model })}
    />
  );
}

/** Picks the Model a new Conversation will be created with. */
function NewConversationModelPicker() {
  const models = useQuery(orpc.models.list.queryOptions());
  const { model, setModel } = useNewConversationModel();

  if (!models.data) return null;
  return (
    <ModelPicker
      value={model}
      models={models.data.models}
      invalid={model !== undefined && missingCredentialsMessage(model, models.data.models) !== null}
      onSelect={(next) => void setModel(next)}
    />
  );
}

function ConversationTitle({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const conversation = useQuery(orpc.conversation.get.queryOptions({ input: { id } }));
  const [renaming, setRenaming] = useState(false);
  const rename = useMutation(
    orpc.conversation.rename.mutationOptions({
      onSuccess: (_, { title }) => {
        queryClient.setQueryData(
          orpc.conversation.get.queryKey({ input: { id } }),
          (old) => old && { ...old, title },
        );
        void invalidateConversationList(queryClient);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const title = rename.isPending ? rename.variables.title : conversation.data?.title;

  const save = (value: string) => {
    setRenaming(false);
    const next = value.trim();
    if (next && next !== title) rename.mutate({ id, title: next });
  };

  if (renaming) {
    return (
      <input
        autoFocus
        aria-label="Conversation title"
        defaultValue={title ?? ""}
        maxLength={200}
        className="h-7 w-72 border bg-background px-2 text-sm outline-none"
        onBlur={(event) => save(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.value = title ?? "";
          if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      title="Rename"
      disabled={!conversation.isSuccess}
      className="group flex min-w-0 items-center gap-1.5 px-2 text-sm font-medium"
      onClick={() => setRenaming(true)}
    >
      <span className="truncate">{title ?? "Untitled"}</span>
      <PencilIcon className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />
    </button>
  );
}
