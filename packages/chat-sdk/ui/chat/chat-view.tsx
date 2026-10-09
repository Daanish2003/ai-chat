import type { AttachmentInfo } from "../../core/shared/attachments/kinds";
import type { AppRouterClient } from "../../core/server/routers/index";
import { ChatContainerContent, ChatContainerRoot } from "@/components/ui/prompt-kit/chat-container";
import { ScrollButton } from "@/components/ui/prompt-kit/scroll-button";
import type { ChatCommand } from "../../core/shared/chat/command";
import { branchFrom, takePendingFirstMessage, toUIMessages } from "../../core/client/chat";
import { missingCredentialsMessage } from "../../core/client/models";
import { fetchServerSentEvents, type UIMessage, useChat } from "@tanstack/ai-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { invalidateConversationList } from "../../core/client/react/conversation-list";
import { useChatAdapter } from "../../core/client/react/provider";
import { readSearchPreference } from "../../core/client/react/search-preference";

import { AttachButton, DraftAttachmentChips, useAttachmentDraft } from "./attachments";
import { Composer } from "./composer";
import { MessageRow } from "./message-row";
import { MissingCredentialsBanner } from "./missing-credentials-banner";
import { SearchToggle, useWebSearch } from "./search-toggle";
import { useFocusMessage } from "./use-focus-message";

export type ConversationData = Awaited<ReturnType<AppRouterClient["conversation"]["get"]>>;

/**
 * One Conversation's Active Branch and composer. `useChat` is the truth while a run streams;
 * when it ends, the Active Branch is refetched and replaces `useChat`'s messages (ADR 0002).
 * A reply still streaming when the page opens (a reload, or a second tab) is joined from its
 * Run's log, so it continues live (ADR 0006).
 */
export function ChatView({
  conversation,
  focusMessageId,
  onFocused = () => {},
}: {
  conversation: ConversationData;
  /** A search hit to land on: its Branch is shown, then it's scrolled to and highlighted. */
  focusMessageId?: string;
  /** Called once `focusMessageId` has been landed on (or couldn't be). */
  onFocused?: () => void;
}) {
  const queryClient = useQueryClient();
  const { orpc, chatUrl } = useChatAdapter();
  // The server writes the new Messages before it streams, so the first chunk means "sent".
  const awaitingFirstChunk = useRef(false);
  // The command for the next request. `reload` (regenerate) takes no body, so every command
  // rides in the connection's body instead.
  const command = useRef<ChatCommand>(undefined);
  const [connection] = useState(() =>
    fetchServerSentEvents(chatUrl, () => ({ body: command.current })),
  );
  // A reply that is streaming when the page opens is joined: its Message id is its Run's id.
  const [joinedRunId] = useState(
    () => conversation.messages.find((m) => m.status === "streaming")?.id,
  );
  const { messages, sendMessage, reload, setMessages, error, isLoading } = useChat({
    connection,
    initialMessages: toUIMessages(conversation.messages),
    initialResumeSnapshot: joinedRunId
      ? { resumeState: { threadId: conversation.id, runId: joinedRunId } }
      : undefined,
    onChunk: () => {
      if (!awaitingFirstChunk.current) return;
      awaitingFirstChunk.current = false;
      void invalidateConversationList(queryClient, orpc);
    },
  });
  const [sending, setSending] = useState(false);
  const serverStreaming = conversation.messages.some((m) => m.status === "streaming");
  const streaming = sending || serverStreaming;
  const conversationQuery = orpc.conversation.get.queryOptions({ input: { id: conversation.id } });
  const fetchConversation = () => queryClient.fetchQuery({ ...conversationQuery, staleTime: 0 });

  const showServerMessages = useEffectEvent((messages: ConversationData["messages"]) => {
    if (sending) return;
    setMessages(toUIMessages(messages));
  });
  useEffect(() => showServerMessages(conversation.messages), [conversation.messages]);

  // A joined reply ends when its log closes: refetch the Conversation so the reply, the streaming
  // state and the Conversation panel row are final. A reply this page sent does this in `run`.
  const joining = useRef(false);
  const joinEnded = useEffectEvent(() => {
    void fetchConversation().finally(() => invalidateConversationList(queryClient, orpc));
  });
  useEffect(() => {
    if (isLoading) {
      joining.current = true;
      return;
    }
    if (!joining.current) return;
    joining.current = false;
    if (!sending) joinEnded();
  }, [isLoading, sending]);

  const stopRun = useMutation(orpc.chat.stop.mutationOptions());
  const stop = async () => {
    // A reply sent from this page only has `useChat`'s id; the server's is on the Active Branch.
    const fresh = await fetchConversation();
    const running = fresh.messages.find((m) => m.status === "streaming");
    if (running) await stopRun.mutateAsync({ messageId: running.id });
  };

  // The selected Model's Provider may have lost its credentials; the server re-checks on send.
  const models = useQuery(orpc.models.list.queryOptions());
  const blocked = models.data
    ? missingCredentialsMessage(conversation.model, models.data.models)
    : null;
  const search = useWebSearch(conversation.model);

  const draft = useAttachmentDraft(conversation.model);

  /**
   * Runs a command under `parentId`: a send or an edit with `text`, a regenerate without.
   * A new Branch replaces what's on screen with `history`, the Messages above the new ones.
   * `attachments` are the new Message's files; an edit passes the full list it keeps.
   */
  const run = async (
    parentId: string | null,
    text?: string,
    history?: UIMessage[],
    attachments: AttachmentInfo[] = [],
  ) => {
    setSending(true);
    awaitingFirstChunk.current = true;
    command.current = {
      conversationId: conversation.id,
      parentId,
      text,
      attachmentIds: attachments.map((attachment) => attachment.id),
      model: conversation.model,
      // Read now: a first Message is sent on mount, before the toggle's state has loaded.
      webSearch: search.available && readSearchPreference(),
    };
    try {
      if (history) setMessages(history);
      // The attachments ride along in the metadata so their chips show while the reply streams.
      await (text === undefined
        ? reload()
        : sendMessage({ content: text, metadata: { attachments } }));
    } finally {
      try {
        const fresh = await fetchConversation();
        setMessages(toUIMessages(fresh.messages));
      } finally {
        setSending(false);
        void invalidateConversationList(queryClient, orpc);
      }
    }
  };

  const send = (text: string, attachments: AttachmentInfo[] = []) =>
    run(conversation.messages.at(-1)?.id ?? null, text, undefined, attachments);

  /**
   * Edit (with `text`) or regenerate `messageId` into a new Branch beside it. An edit sends the
   * attachments the user kept and added; a regenerate leaves the user Message's alone.
   */
  const startBranch = (messageId: string, text?: string, attachments?: AttachmentInfo[]) => {
    const { parentId, history } = branchFrom(messages, messageId);
    void run(parentId, text, history, attachments);
  };

  const switchBranch = useMutation(
    orpc.conversation.switchBranch.mutationOptions({
      onSuccess: () => fetchConversation(),
      onError: (caught) => toast.error(`Switching Branch failed: ${caught.message}`),
    }),
  );

  const highlighted = useFocusMessage({
    target: focusMessageId,
    onScreen: messages.map((message) => message.id),
    activeBranch: conversation.messages.map((message) => message.id),
    switchBranch: (messageId) => switchBranch.mutateAsync({ messageId }),
    onFocused,
  });

  // A new Conversation arrives here with its first Message still to send. Taken a tick later:
  // StrictMode's throwaway first mount would otherwise take it and drop it on unmount.
  const sendPendingFirstMessage = useEffectEvent(() => {
    const pending = takePendingFirstMessage(conversation.id);
    if (pending) void send(pending.text, pending.attachments);
  });
  useEffect(() => {
    const timer = setTimeout(sendPendingFirstMessage);
    return () => clearTimeout(timer);
  }, [conversation.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatContainerRoot className="relative min-h-0 flex-1">
        <ChatContainerContent className="py-2">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              highlighted={message.id === highlighted}
              actions={{
                streaming: streaming || switchBranch.isPending,
                model: conversation.model,
                onEdit: (text, attachments) => startBranch(message.id, text, attachments),
                onRegenerate: () => startBranch(message.id),
                onSwitchBranch: (messageId) => switchBranch.mutate({ messageId }),
              }}
            />
          ))}
        </ChatContainerContent>
        <div className="absolute right-6 bottom-3">
          <ScrollButton />
        </div>
      </ChatContainerRoot>
      <div className="border-t bg-background px-3 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          {error && !sending && (
            <p role="alert" className="text-xs text-destructive">
              {error.message}
            </p>
          )}
          {blocked && <MissingCredentialsBanner message={blocked} />}
          <Composer
            onSend={(text) => {
              void send(text, draft.uploaded);
              draft.clear();
            }}
            attachments={<DraftAttachmentChips draft={draft} />}
            attachmentsPending={draft.pending}
            onStop={
              stopRun.isPending
                ? undefined
                : () =>
                    stop().catch((caught: Error) =>
                      toast.error(`Stopping failed: ${caught.message}`),
                    )
            }
            streaming={streaming}
            // The next Message continues the Branch being switched to, so wait for it.
            disabled={!!blocked || switchBranch.isPending}
          >
            <AttachButton draft={draft} disabled={!!blocked} />
            <SearchToggle search={search} />
          </Composer>
        </div>
      </div>
    </div>
  );
}
