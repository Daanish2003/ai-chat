import { conversation } from "@ai-chat/db/schema/chat";
import { desc, eq } from "drizzle-orm";

import { listCredentials, loadCredentials } from "../credentials/store";
import type { AppDeps } from "../deps";
import { ollamaModels, openRouterModels } from "./live-models";
import { type CuratedModel, curatedModels, defaultModelFor, findModel } from "./models";

type Deps = Pick<AppDeps, "db" | "keyEncryptionSecret" | "fetch">;

/**
 * The Models the user can chat with (those of Providers they have credentials for, with the live
 * OpenRouter and Ollama lists) and the Model a new Conversation starts on: the Model of their
 * most recent Conversation while it is still available, else the code default of the first
 * Provider they added (or that Provider's first Model, when the default isn't listed).
 */
export async function listAvailableModels(
  deps: Deps,
  userId: string,
): Promise<{ models: CuratedModel[]; defaultModel: string | null }> {
  const services = (await listCredentials(deps, userId)).map((credential) => credential.service);
  const models = [
    ...curatedModels.filter((model) => services.includes(model.provider)),
    ...(services.includes("openrouter") ? await openRouterModels(deps.fetch) : []),
    ...(services.includes("ollama") ? await installedOllamaModels(deps, userId) : []),
  ];

  const [recent] = await deps.db
    .select({ model: conversation.model })
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.lastMessageAt), desc(conversation.id))
    .limit(1);
  const recentModel = models.find((model) => model.id === recent?.model)?.id;
  const firstProvider = services
    .map((service) => models.find((model) => model.provider === service)?.provider)
    .find((provider) => provider !== undefined);
  const providerDefault =
    firstProvider &&
    (
      models.find((model) => model.id === defaultModelFor(firstProvider)) ??
      models.find((model) => model.provider === firstProvider)
    )?.id;

  return { models, defaultModel: recentModel ?? providerDefault ?? null };
}

/**
 * The Model for a `"provider:model"` id the user can pick: a curated one, or one on the live
 * OpenRouter list or the user's Ollama host. `undefined` when it is none of those.
 */
export async function resolveModel(
  deps: Deps,
  userId: string,
  id: string,
): Promise<CuratedModel | undefined> {
  const curated = findModel(id);
  if (curated) return curated;
  const live = id.startsWith("openrouter:")
    ? await openRouterModels(deps.fetch)
    : id.startsWith("ollama:")
      ? await installedOllamaModels(deps, userId)
      : [];
  return live.find((model) => model.id === id);
}

async function installedOllamaModels(deps: Deps, userId: string) {
  const host = (await loadCredentials(deps, userId, "ollama"))?.host;
  return host ? ollamaModels(deps.fetch, host) : [];
}
