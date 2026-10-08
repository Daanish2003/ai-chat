import type { AppRouterClient } from "@ai-chat/api/routers/index";
import type { RouterUtils } from "@orpc/tanstack-query";
import { type ComponentType, createContext, type ReactNode, useContext } from "react";

/** The oRPC TanStack Query utils for the `@ai-chat/api` router. */
export type ChatOrpc = RouterUtils<AppRouterClient>;

/** A page the chat UI links or navigates to. The host app maps each to its own route. */
export type ChatPage =
  | { to: "new"; model?: string }
  | { to: "conversation"; id: string; message?: string }
  | { to: "keys" };

export type ChatLinkProps = {
  page: ChatPage;
  className?: string;
  /** Added to `className` while `page` is the current page. */
  activeClassName?: string;
  title?: string;
  "aria-label"?: string;
  onClick?: () => void;
  children?: ReactNode;
};

/** Where the user is, as far as the chat UI cares. */
export type ChatLocation = {
  /** The Conversation open on its page. */
  conversationId?: string;
  /** On the new Conversation page. */
  newConversation: boolean;
  /** The Model picked for the new Conversation (`?model=` in the web app). */
  newConversationModel?: string;
  /** The top bar's title on a page that isn't a Conversation. */
  pageTitle?: string;
};

export type ChatAdapter = {
  orpc: ChatOrpc;
  /** Where `useChat` posts commands and streams replies (`handleChat`). */
  chatUrl: string;
  /** A Shared link's public URL. */
  shareUrl: (token: string) => string;
  Link: ComponentType<ChatLinkProps>;
  navigate: (page: ChatPage, options?: { replace?: boolean }) => Promise<void> | void;
  /** A hook: called during render by the chat UI. */
  useLocation: () => ChatLocation;
};

const ChatContext = createContext<ChatAdapter | null>(null);

/** Gives the chat UI its API client and the host app's routing. */
export function ChatProvider({ adapter, children }: { adapter: ChatAdapter; children: ReactNode }) {
  return <ChatContext value={adapter}>{children}</ChatContext>;
}

export function useChatAdapter() {
  const adapter = useContext(ChatContext);
  if (!adapter) throw new Error("The chat UI must be inside a <ChatProvider>");
  return adapter;
}

export function useOrpc() {
  return useChatAdapter().orpc;
}

export function useChatLocation() {
  return useChatAdapter().useLocation();
}
