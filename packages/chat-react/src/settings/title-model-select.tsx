import { findModel } from "@ai-chat/api/shared/chat/models";
import { missingCredentialsMessage, modelGroups } from "@ai-chat/chat-core/models";
import { Label } from "@ai-chat/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useOrpc } from "../provider";

const sameAsFirstReply = "";

/** The Title Model select: which Model writes automatic titles ("Same as first reply" by default). */
export function TitleModelSelect() {
  const queryClient = useQueryClient();
  const orpc = useOrpc();
  const settings = useQuery(orpc.settings.get.queryOptions());
  const models = useQuery(orpc.models.list.queryOptions());
  const settingsKey = orpc.settings.get.queryKey();
  const setTitleModel = useMutation(
    orpc.settings.setTitleModel.mutationOptions({
      onMutate: ({ titleModel }) => {
        const previous = settings.data;
        queryClient.setQueryData(settingsKey, { titleModel });
        return { previous };
      },
      onError: (error, _, context) => {
        if (context?.previous) queryClient.setQueryData(settingsKey, context.previous);
        toast.error(error.message);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKey }),
    }),
  );

  const available = models.data?.models ?? [];
  const saved = settings.data?.titleModel ?? null;
  // A saved Title Model whose Provider lost its credentials stays selectable, and says so.
  const missingKey = saved ? missingCredentialsMessage(saved, available) : null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Titles</h2>
      <div className="space-y-2 rounded-xl border px-4 py-3">
        <Label htmlFor="title-model">Title Model</Label>
        <select
          id="title-model"
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          disabled={settings.isPending || models.isPending}
          value={saved ?? sameAsFirstReply}
          onChange={(event) => setTitleModel.mutate({ titleModel: event.target.value || null })}
        >
          <option value={sameAsFirstReply}>Same as first reply</option>
          {saved && missingKey && (
            <option value={saved}>{findModel(saved)?.label ?? saved} (no key)</option>
          )}
          {modelGroups(available, "").map((group) => (
            <optgroup key={group.provider} label={group.label}>
              {group.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {missingKey
            ? `${missingKey}. Until then, titles are the start of your first Message.`
            : "Writes each new Conversation's title after the first reply. A cheap Model is enough."}
        </p>
      </div>
    </section>
  );
}
