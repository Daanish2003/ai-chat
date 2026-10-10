import { modelGroups, modelLabel } from "../../core/client/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { useOrpc } from "../../core/client/react/provider";

/** The select's value for "no default Model", which a Project stores as `null`. */
const noModel = "none";

/**
 * Edits a Project's name and default Model. The default Model is sent only when the user changes
 * it, so a stored Model that is no longer available doesn't block a rename.
 */
export function EditProjectForm({
  projectId,
  name,
  defaultModel,
  onDone,
}: {
  projectId: string;
  name: string;
  /** The stored default Model; null when it has none. */
  defaultModel: string | null;
  onDone: () => void;
}) {
  const orpc = useOrpc();
  const queryClient = useQueryClient();
  const models = useQuery(orpc.models.list.queryOptions());
  const [draftName, setDraftName] = useState(name);
  const [draftModel, setDraftModel] = useState(defaultModel ?? noModel);
  const update = useMutation(
    orpc.project.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Project saved");
        await queryClient.invalidateQueries({ queryKey: orpc.project.key() });
        onDone();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const trimmed = draftName.trim();
  const available = models.data?.models ?? [];
  // A stored Model that `models.list` no longer offers stays selectable, and says so.
  const unavailable =
    defaultModel && !available.some((model) => model.id === defaultModel) ? defaultModel : null;
  const groups = modelGroups(available, "");
  // What the trigger shows for the selected value.
  const items = [
    { value: noModel, label: "No default Model" },
    ...(unavailable
      ? [{ value: unavailable, label: `${modelLabel(unavailable)} (unavailable)` }]
      : []),
    ...groups.flatMap((group) =>
      group.models.map((model) => ({ value: model.id, label: model.label })),
    ),
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    const changedModel = draftModel !== (defaultModel ?? noModel);
    update.mutate({
      id: projectId,
      name: trimmed,
      defaultModel: changedModel ? (draftModel === noModel ? null : draftModel) : undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border px-4 py-3">
      <div className="space-y-1.5">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          maxLength={100}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project-model">Default Model</Label>
        <Select
          items={items}
          value={draftModel}
          onValueChange={(value) => value && setDraftModel(value)}
          disabled={models.isPending}
        >
          <SelectTrigger id="project-model" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={noModel}>No default Model</SelectItem>
              {unavailable && (
                <SelectItem value={unavailable}>
                  {`${modelLabel(unavailable)} (unavailable)`}
                </SelectItem>
              )}
            </SelectGroup>
            {groups.map((group) => (
              <SelectGroup key={group.provider}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          New Conversations in this Project start on this Model. Replies already written keep
          theirs.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={!trimmed || update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
