import {
  type ChatLinkProps,
  type ChatLocation,
  type ChatPage,
  ChatProvider,
  type ChatRouter,
} from "@ai-chat/chat-sdk/client";
import type { QueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams, useRouter, useSearch } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

import { chatClient } from "@/utils/orpc";

/** The web app's route for each chat page. */
function routeOf(page: ChatPage) {
  switch (page.to) {
    case "new":
      return page.model ? { to: "/c", search: { model: page.model } } : { to: "/c" };
    case "conversation":
      return {
        to: "/c/$id",
        params: { id: page.id },
        ...(page.message && { search: { message: page.message } }),
      };
    case "keys":
      return { to: "/settings/keys" };
  }
}

function ChatLink({ page, activeClassName, ...props }: ChatLinkProps) {
  return (
    <Link
      {...routeOf(page)}
      {...props}
      activeProps={activeClassName ? { className: activeClassName } : undefined}
    />
  );
}

const pageTitles: Record<string, string> = {
  "/settings/keys": "Keys & settings",
  "/settings/account": "Account",
};

function useChatLocation(): ChatLocation {
  const { id } = useParams({ strict: false });
  const { model } = useSearch({ strict: false });
  const pathname = useLocation({ select: (location) => location.pathname.replace(/\/$/, "") });
  return {
    conversationId: id,
    newConversation: pathname === "/c",
    newConversationModel: model,
    pageTitle: pageTitles[pathname],
  };
}

/** The chat UI wired to this app's chat client and TanStack Router routes. */
export function WebChatProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  const router = useRouter();
  const chatRouter = useMemo<ChatRouter>(
    () => ({
      shareUrl: (token) => `${window.location.origin}/share/${token}`,
      Link: ChatLink,
      navigate: (page, options) => router.navigate({ ...routeOf(page), ...options }),
      useLocation: useChatLocation,
    }),
    [router],
  );
  return (
    <ChatProvider client={chatClient} router={chatRouter} queryClient={queryClient}>
      {children}
    </ChatProvider>
  );
}
