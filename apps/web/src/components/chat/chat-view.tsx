import type { AppRouterClient } from "@ai-chat/api/routers/index";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@ai-chat/ui/components/prompt-kit/chat-container";
import { ScrollButton } from "@ai-chat/ui/components/prompt-kit/scroll-button";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";

import { takePendingFirstMessage, toUIMessages } from "@/lib/chat";
import { orpc } from "@/utils/orpc";

import { Composer } from "./composer";
import { MessageRow } from "./message-row";

export type ConversationData = Awaited<ReturnType<AppRouterClient["conversation"]["get"]>>;

const connection = fetchServerSentEvents("/api/chat");

/**
 * One Conversation's Active Branch and composer. `useChat` is the truth while a run streams;
 * when it ends, the Active Branch is refetched and replaces `useChat`'s messages (ADR 0002).
 * A run this page didn't start (the page was reloaded mid-reply) is followed by polling the
 * Active Branch until nothing is `streaming`.
 */
export function ChatView({ conversation }: { conversation: ConversationData }) {
  const queryClient = useQueryClient();
  const { messages, sendMessage, setMessages, error } = useChat({
    connection,
    initialMessages: toUIMessages(conversation.messages),
  });
  const [sending, setSending] = useState(false);
  const serverStreaming = conversation.messages.some((m) => m.status === "streaming");
  const streaming = sending || serverStreaming;
  const conversationQuery = orpc.conversation.get.queryOptions({ input: { id: conversation.id } });
  const fetchConversation = () => queryClient.fetchQuery({ ...conversationQuery, staleTime: 0 });

  // Updates `conversation` (the route reads the same query) about every second.
  const polling = !sending && serverStreaming;
  useQuery({ ...conversationQuery, enabled: polling, refetchInterval: polling ? 1_000 : false });
  const showServerMessages = useEffectEvent((messages: ConversationData["messages"]) => {
    if (!sending) setMessages(toUIMessages(messages));
  });
  useEffect(() => showServerMessages(conversation.messages), [conversation.messages]);

  const stopRun = useMutation(orpc.chat.stop.mutationOptions());
  const stop = async () => {
    // A reply sent from this page only has `useChat`'s id; the server's is on the Active Branch.
    const fresh = await fetchConversation();
    const running = fresh.messages.find((m) => m.status === "streaming");
    if (running) await stopRun.mutateAsync({ messageId: running.id });
  };

  const send = async (text: string) => {
    setSending(true);
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
        const fresh = await fetchConversation();
        setMessages(toUIMessages(fresh.messages));
      } finally {
        setSending(false);
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
        <Composer
          onSend={(text) => void send(text)}
          onStop={stopRun.isPending ? undefined : () => void stop()}
          streaming={streaming}
        />
      </div>
    </div>
  );
}
