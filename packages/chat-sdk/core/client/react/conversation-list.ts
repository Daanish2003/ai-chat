import type { QueryClient } from "@tanstack/react-query";

import type { ChatOrpc } from "./provider";

/** Refetches the Conversation panel: after a send, a run's end, a new Conversation, a rename or a delete. */
export function invalidateConversationList(queryClient: QueryClient, orpc: ChatOrpc) {
  return queryClient.invalidateQueries({ queryKey: orpc.conversation.list.key() });
}
