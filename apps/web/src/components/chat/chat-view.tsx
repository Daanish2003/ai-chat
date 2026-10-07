import type { AppRouterClient } from "@ai-chat/api/routers/index";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@ai-chat/ui/components/prompt-kit/chat-container";
import { ScrollButton } from "@ai-chat/ui/components/prompt-kit/scroll-button";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { takePendingFirstMessage, toUIMessages } from "@/lib/chat";
import { invalidateConversationList } from "@/lib/conversation-list";
import { missingCredentialsMessage } from "@/lib/model-picker";
import { orpc } from "@/utils/orpc";

import { Composer } from "./composer";
import { MessageRow } from "./message-row";
import { MissingCredentialsBanner } from "./missing-credentials-banner";

export type ConversationData = Awaited<ReturnType<AppRouterClient["conversation"]["get"]>>;

const connection = fetchServerSentEvents("/api/chat");

/**
 * One Conversation's Active Branch and composer. `useChat` is the truth while a run streams;
 * when it ends, the Active Branch is refetched and replaces `useChat`'s messages (ADR 0002).
 */
export function ChatView({ conversation }: { conversation: ConversationData }) {
  const queryClient = useQueryClient();
  // The server writes the new Messages before it streams, so the first chunk means "sent".
  const awaitingFirstChunk = useRef(false);
  const { messages, sendMessage, setMessages, error } = useChat({
    connection,
    initialMessages: toUIMessages(conversation.messages),
    onChunk: () => {
      if (!awaitingFirstChunk.current) return;
      awaitingFirstChunk.current = false;
      void invalidateConversationList(queryClient);
    },
  });
  const [sending, setSending] = useState(false);
  const streaming = sending || conversation.messages.some((m) => m.status === "streaming");
  // The selected Model's Provider may have lost its credentials; the server re-checks on send.
  const models = useQuery(orpc.models.list.queryOptions());
  const blocked = models.data
    ? missingCredentialsMessage(conversation.model, models.data.models)
    : null;

  const send = async (text: string) => {
    setSending(true);
    awaitingFirstChunk.current = true;
    try {
      await sendMessage(text, {
        body: {
          conversationId: conversation.id,
          parentId: conversation.messages.at(-1)?.id ?? null,
          text,
          attachmentIds: [],
          model: conversation.model,
          webSearch: false,
        },
      });
    } finally {
      try {
        const fresh = await queryClient.fetchQuery({
          ...orpc.conversation.get.queryOptions({ input: { id: conversation.id } }),
          staleTime: 0,
        });
        setMessages(toUIMessages(fresh.messages));
      } finally {
        setSending(false);
        void invalidateConversationList(queryClient);
      }
    }
  };

  // A new Conversation arrives here with its first Message still to send.
  const sendPendingFirstMessage = useEffectEvent(() => {
    const text = takePendingFirstMessage(conversation.id);
    if (text) void send(text);
  });
  useEffect(() => sendPendingFirstMessage(), [conversation.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatContainerRoot className="relative min-h-0 flex-1">
        <ChatContainerContent className="py-2">
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
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
        <Composer onSend={(text) => void send(text)} disabled={streaming || !!blocked} />
      </div>
    </div>
  );
}
