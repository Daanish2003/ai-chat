import { type CuratedModel, findModel } from "@ai-chat/api/chat/models";
import { addKeyMessage, providers } from "@ai-chat/api/credentials/services";

export type ModelGroup = {
  provider: CuratedModel["provider"];
  label: string;
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
    return matching.length > 0 ? [{ provider: id, label, models: matching }] : [];
  });
}

/**
 * Why the selected Model can't be sent to, or `null` when it can. `available` is what
 * `models.list` offers: the Models of Providers the user has credentials for.
 */
export function missingCredentialsMessage(selected: string, available: CuratedModel[]) {
  if (available.some((model) => model.id === selected)) return null;
  const model = findModel(selected);
  return model ? addKeyMessage(model.provider) : "Pick another Model";
}
