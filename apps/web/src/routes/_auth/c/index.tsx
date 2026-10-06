import { buttonVariants } from "@ai-chat/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Composer } from "@/components/chat/composer";
import { Welcome } from "@/components/chat/welcome";
import { availableModels, setPendingFirstMessage } from "@/lib/chat";
import { invalidateConversationList } from "@/lib/conversation-list";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/c/")({
  component: NewConversation,
});

/** A new Conversation: pick a Model, type the first Message; it's created when sent. */
function NewConversation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const credentials = useQuery(orpc.credentials.list.queryOptions());
  const models = availableModels(credentials.data ?? []);
  const [chosen, setChosen] = useState<string>();
  const model = chosen ?? models[0]?.id;
  const create = useMutation(orpc.conversation.create.mutationOptions());

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

  if (credentials.isSuccess && models.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-medium">Bring your own key to start</h1>
        <Link to="/settings/keys" className={buttonVariants()}>
          Add Provider credentials
        </Link>
      </main>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <main className="flex flex-1 items-center justify-center p-6">
        <Welcome onSuggest={(text) => void start(text)} disabled={!model || create.isPending} />
      </main>
      <div className="border-t bg-background px-6 py-3">
        <Composer onSend={(text) => void start(text)} disabled={!model || create.isPending}>
          <select
            aria-label="Model"
            className="h-8 border bg-background px-2 text-xs"
            value={model ?? ""}
            onChange={(event) => setChosen(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          >
            {models.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Composer>
      </div>
    </div>
  );
}
