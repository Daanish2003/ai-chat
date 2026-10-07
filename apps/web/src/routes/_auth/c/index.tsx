import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Composer } from "@/components/chat/composer";
import { MissingCredentialsBanner } from "@/components/chat/missing-credentials-banner";
import { NoCredentials } from "@/components/chat/no-credentials";
import { Welcome } from "@/components/chat/welcome";
import { setPendingFirstMessage } from "@/lib/chat";
import { invalidateConversationList } from "@/lib/conversation-list";
import { missingCredentialsMessage } from "@/lib/models";
import { useNewConversationModel } from "@/lib/new-conversation-model";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/c/")({
  /** `?model=` is the Model picked in the top bar; without it, `models.list`'s default. */
  validateSearch: z.object({ model: z.string().optional() }),
  component: NewConversation,
});

/** A new Conversation: type the first Message; it's created with the picked Model when sent. */
function NewConversation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const models = useQuery(orpc.models.list.queryOptions());
  const { model } = useNewConversationModel();
  const create = useMutation(orpc.conversation.create.mutationOptions());
  const blocked =
    models.data && model ? missingCredentialsMessage(model, models.data.models) : null;
  const disabled = !model || !!blocked || create.isPending;

  const start = async (text: string) => {
    if (!model) return;
    try {
      const { id } = await create.mutateAsync({ model });
      void invalidateConversationList(queryClient);
      setPendingFirstMessage(id, text);
      await navigate({ to: "/c/$id", params: { id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the Conversation");
    }
  };

  if (models.data?.models.length === 0) return <NoCredentials />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <main className="flex flex-1 items-center justify-center p-6">
        <Welcome onSuggest={(text) => void start(text)} disabled={disabled} />
      </main>
      <div className="flex flex-col gap-2 border-t bg-background px-6 py-3">
        {blocked && <MissingCredentialsBanner message={blocked} />}
        <Composer onSend={(text) => void start(text)} disabled={disabled} />
      </div>
    </div>
  );
}
