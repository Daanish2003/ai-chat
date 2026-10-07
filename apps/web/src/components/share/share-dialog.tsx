import { Button, buttonVariants } from "@ai-chat/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-chat/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, Link2Icon, Share2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { invalidateConversationList } from "@/lib/conversation-list";
import { relativeTime } from "@/lib/relative-time";
import { orpc } from "@/utils/orpc";

const blockedReasons = {
  empty: "Send a message before sharing.",
  streaming: "Wait for the reply to finish before sharing.",
  error: "The newest reply ended in an error. Regenerate it before sharing.",
} as const;

/** The top bar's Share button and its dialog. */
export function ShareButton({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Share2Icon /> Share
      </Button>
      <ShareDialog conversationId={conversationId} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Creates, updates or deletes the Conversation's Shared link (ADR 0004). Fetched fresh on every
 * open, and polled while a reply streams, so the link state and the reason sharing is blocked
 * are current.
 */
export function ShareDialog({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const statusQuery = orpc.share.forConversation.queryOptions({ input: { conversationId } });
  const status = useQuery({
    ...statusQuery,
    enabled: open,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.blockedBy === "streaming" ? 1_000 : false),
  });
  const callbacks = {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: statusQuery.queryKey });
      await invalidateConversationList(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  };
  const upsert = useMutation(orpc.share.upsert.mutationOptions(callbacks));
  const remove = useMutation(orpc.share.delete.mutationOptions(callbacks));

  const title = useQuery(orpc.conversation.get.queryOptions({ input: { id: conversationId } })).data
    ?.title;
  const link = status.data?.link;
  const blockedBy = status.data?.blockedBy;
  const url = link ? `${window.location.origin}/share/${link.token}` : "";
  const busy = upsert.isPending || remove.isPending;
  const canShare = status.isSuccess && !blockedBy && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{title ?? "Untitled"}"</DialogTitle>
          <DialogDescription>
            Anyone with the link sees this Branch up to its newest Message, read-only and without
            your name. Thinking is hidden and files are never shared.
          </DialogDescription>
        </DialogHeader>

        {status.isError && (
          <p role="alert" className="text-destructive">
            Couldn't load the Shared link: {status.error.message}
          </p>
        )}

        {blockedBy && (
          <p
            role="status"
            className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive"
          >
            {blockedReasons[blockedBy]}
          </p>
        )}

        {link ? (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 border bg-background px-2.5 py-1.5">
                <Link2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-mono">{url}</span>
                <CopyButton text={url} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Shared {relativeTime(link.updatedAt)}.
                {status.data?.movedOn &&
                  " The Conversation has moved on since; Update link to share the current Branch."}
              </p>
            </div>
            <div className="flex justify-between gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => remove.mutate({ conversationId })}
              >
                Delete link
              </Button>
              <div className="flex gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Preview
                </a>
                <Button
                  size="sm"
                  disabled={!canShare}
                  onClick={() => upsert.mutate({ conversationId })}
                >
                  Update link
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!canShare}
              onClick={() => upsert.mutate({ conversationId })}
            >
              <Link2Icon /> Create link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? "Copied" : "Copy link"}
      title="Copy link"
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
