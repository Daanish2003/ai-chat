import {
  type CuratedModel,
  findModel,
  isLiveListProvider,
  parseModelId,
} from "@ai-chat/api/shared/chat/models";
import { addKeyMessage, providers } from "@ai-chat/api/shared/credentials/services";

export type ModelGroup = {
  provider: CuratedModel["provider"];
  label: string;
  /** The group is the Provider's live list (OpenRouter, Ollama), not a curated one. */
  live: boolean;
  models: CuratedModel[];
};

/** The picker's list: `models` matching the search text (Model or Provider name), grouped by Provider. */
export function modelGroups(models: CuratedModel[], search: string): ModelGroup[] {
  const query = search.trim().toLowerCase();
  return providers.flatMap(({ id, label }) => {
    const providerMatches = label.toLowerCase().includes(query);
    const matching = models.filter(
      (model) =>
        model.provider === id && (providerMatches || model.label.toLowerCase().includes(query)),
    );
    return matching.length > 0
      ? [{ provider: id, label, live: isLiveListProvider(id), models: matching }]
      : [];
  });
}

/**
 * Why the selected Model can't be sent to, or `null` when it can. `available` is what
 * `models.list` offers: the Models of Providers the user has credentials for.
 */
export function missingCredentialsMessage(selected: string, available: CuratedModel[]) {
  if (available.some((model) => model.id === selected)) return null;
  const prefix = parseModelId(selected)?.provider ?? "";
  const provider =
    findModel(selected)?.provider ?? (isLiveListProvider(prefix) ? prefix : undefined);
  // A live-listed Model can leave its list while the Provider still has credentials.
  return provider && !available.some((model) => model.provider === provider)
    ? addKeyMessage(provider)
    : "Pick another Model";
}

/** A Model's name to show: its curated label, else (a live-listed Model) its id without the Provider. */
export function modelLabel(id: string) {
  return findModel(id)?.label ?? parseModelId(id)?.modelId ?? id;
}
