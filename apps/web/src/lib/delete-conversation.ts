import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { invalidateConversationList } from "@/lib/conversation-list";
import { orpc } from "@/utils/orpc";

/**
 * Deletes a Conversation after the user confirms (mentioning its Shared link), leaving it first
 * when it's open. Used by the Conversation panel and the palette.
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id: openId } = useParams({ strict: false });
  const remove = useMutation(
    orpc.conversation.delete.mutationOptions({
      onSuccess: async (_, { id }) => {
        if (openId === id) await navigate({ to: "/c" });
        queryClient.removeQueries({ queryKey: orpc.conversation.get.queryKey({ input: { id } }) });
        await invalidateConversationList(queryClient);
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
