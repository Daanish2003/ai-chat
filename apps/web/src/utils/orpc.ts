import { type ChatClient, createChatClient } from "@ai-chat/chat-sdk/client";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { toast } from "sonner";

import { chat } from "../services";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

// On the server the client calls the chat handler in process; in the browser it calls the route.
const getChatClient = createIsomorphicFn()
  .server((): ChatClient =>
    createChatClient({
      baseUrl: "http://localhost/api/chat",
      fetch: (request) => {
        // A call made while rendering carries the page request's cookies, so `getUser` sees the session.
        const headers = new Headers(request.headers);
        const cookie = getRequest().headers.get("cookie");
        if (cookie) headers.set("cookie", cookie);
        return chat.handler(new Request(request, { headers }));
      },
    }),
  )
  .client((): ChatClient =>
    createChatClient({
      baseUrl: `${window.location.origin}/api/chat`,
    }),
  );

export const chatClient = getChatClient();

export const orpc = chatClient.orpc;
