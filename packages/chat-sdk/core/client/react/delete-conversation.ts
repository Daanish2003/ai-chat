import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateConversationList } from "./conversation-list";
import { useChatAdapter, useChatLocation } from "./provider";

/**
 * Deletes a Conversation after the user confirms (mentioning its Shared link), leaving it first
 * when it's open. Used by the Conversation panel and the palette.
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const { orpc, navigate } = useChatAdapter();
  const { conversationId: openId } = useChatLocation();
  const remove = useMutation(
    orpc.conversation.delete.mutationOptions({
      onSuccess: async (_, { id }) => {
        if (openId === id) await navigate({ to: "new" });
        queryClient.removeQueries({ queryKey: orpc.conversation.get.queryKey({ input: { id } }) });
        await invalidateConversationList(queryClient, orpc);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const confirmDelete = (conversation: { id: string; title: string | null; shared: boolean }) => {
    const title = conversation.title ?? "Untitled";
    const sharedNote = conversation.shared ? " This also deletes its Shared link." : "";
    if (window.confirm(`Delete "${title}"?${sharedNote} This can't be undone.`)) {
      remove.mutate({ id: conversation.id });
    }
  };

  return { confirmDelete, isPending: remove.isPending };
}
