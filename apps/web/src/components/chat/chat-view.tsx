import type { AttachmentInfo } from "@ai-chat/api/attachments/store";
import type { AppRouterClient } from "@ai-chat/api/routers/index";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@ai-chat/ui/components/prompt-kit/chat-container";
import { ScrollButton } from "@ai-chat/ui/components/prompt-kit/scroll-button";
import type { ChatCommand } from "@ai-chat/api/chat/handle-chat";
import { fetchServerSentEvents, type UIMessage, useChat } from "@tanstack/ai-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { branchFrom, takePendingFirstMessage, toUIMessages } from "@/lib/chat";
import { invalidateConversationList } from "@/lib/conversation-list";
import { missingCredentialsMessage } from "@/lib/models";
import { readSearchPreference } from "@/lib/web-search";
import { orpc } from "@/utils/orpc";

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
 * A run this page didn't start (the page was reloaded mid-reply) is followed by polling the
 * Active Branch until nothing is `streaming`.
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
  // The server writes the new Messages before it streams, so the first chunk means "sent".
  const awaitingFirstChunk = useRef(false);
  // The command for the next request. `reload` (regenerate) takes no body, so every command
  // rides in the connection's body instead.
  const command = useRef<ChatCommand>(undefined);
  const [connection] = useState(() =>
    fetchServerSentEvents("/api/chat", () => ({ body: command.current })),
  );
  const { messages, sendMessage, reload, setMessages, error } = useChat({
    connection,
    initialMessages: toUIMessages(conversation.messages),
    onChunk: () => {
      if (!awaitingFirstChunk.current) return;
      awaitingFirstChunk.current = false;
      void invalidateConversationList(queryClient);
    },
  });
  const [sending, setSending] = useState(false);
  const serverStreaming = conversation.messages.some((m) => m.status === "streaming");
  const streaming = sending || serverStreaming;
  const conversationQuery = orpc.conversation.get.queryOptions({ input: { id: conversation.id } });
  const fetchConversation = () => queryClient.fetchQuery({ ...conversationQuery, staleTime: 0 });

  // Updates `conversation` (the route reads the same query) about every second.
  const polling = !sending && serverStreaming;
  useQuery({ ...conversationQuery, enabled: polling, refetchInterval: polling ? 1_000 : false });
  const wasPolling = useRef(false);
  const showServerMessages = useEffectEvent((messages: ConversationData["messages"]) => {
    if (sending) return;
    setMessages(toUIMessages(messages));
    // A run this page was polling just ended, so its Conversation panel row changed.
    if (wasPolling.current && !polling) void invalidateConversationList(queryClient);
    wasPolling.current = polling;
  });
  useEffect(() => showServerMessages(conversation.messages), [conversation.messages]);

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
        void invalidateConversationList(queryClient);
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

  // A new Conversation arrives here with its first Message still to send.
  const sendPendingFirstMessage = useEffectEvent(() => {
    const pending = takePendingFirstMessage(conversation.id);
    if (pending) void send(pending.text, pending.attachments);
  });
  useEffect(() => sendPendingFirstMessage(), [conversation.id]);

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
      <div className="flex flex-col gap-2 border-t bg-background px-6 py-3">
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
                  stop().catch((caught: Error) => toast.error(`Stopping failed: ${caught.message}`))
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
  );
}
