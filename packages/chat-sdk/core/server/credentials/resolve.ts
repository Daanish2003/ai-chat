import { findModel, parseModelId, type CuratedModel } from "../../shared/chat/models";
import type { AppDeps, Credentials, HostModel, HostProvider } from "../deps";
import { listCredentials, loadCredentials } from "./store";

type Deps = Pick<AppDeps, "db" | "keyEncryptionSecret">;

/**
 * The one place that decides which credentials a call uses. For a Provider or Tool `service`, a
 * call uses the user's own credentials for it, or none. Every call (a Run, a title, a web search,
 * the Model list, the new-Conversation check) goes through here rather than the store.
 */
export function resolveCredentials(
  deps: Deps,
  userId: string,
  service: string,
): Promise<Credentials | null> {
  return loadCredentials(deps, userId, service);
}

/** The services the user has usable credentials for, in the order they were added. */
export async function resolvedServices(deps: Deps, userId: string): Promise<string[]> {
  return (await listCredentials(deps, userId)).map((credential) => credential.service);
}

/** What a call to a Model runs with: the credentials, and the output cap when a Host pays. */
export type ModelCall = {
  credentials: Credentials;
  /** Set on a Host Model: bounds the Run (ADR 0007). */
  maxOutputTokens?: number;
};

type ModelDeps = Pick<AppDeps, "db" | "keyEncryptionSecret" | "hostProviders" | "byok">;

/**
 * The credentials a call to the `"provider:model"` id uses (ADR 0007). The user's own key for its
 * Provider always wins and is never metered; with `byok` off it is ignored. Otherwise the Host's
 * credentials, when the Host offers that Model. `null` when neither applies.
 */
export async function resolveModelCall(
  deps: ModelDeps,
  userId: string,
  id: string,
): Promise<ModelCall | null> {
  const provider = parseModelId(id)?.provider;
  if (!provider) return null;
  if (deps.byok) {
    const own = await resolveCredentials(deps, userId, provider);
    if (own) return { credentials: own };
  }
  const offered = hostEntry(deps, id);
  return offered
    ? {
        credentials: offered.hostProvider.credentials,
        maxOutputTokens: offered.model.maxOutputTokens,
      }
    : null;
}

/**
 * The Host's Models as Models. A Model whose id is curated takes its label and capability flags
 * from the curated list, unless the Host states its own.
 */
export function hostModelList(deps: Pick<AppDeps, "hostProviders">): CuratedModel[] {
  return deps.hostProviders.flatMap(({ provider, models }) =>
    models.map((model): CuratedModel => {
      const id = `${provider}:${model.modelId}`;
      const curated = findModel(id);
      return {
        id,
        provider,
        modelId: model.modelId,
        label: model.label ?? curated?.label ?? model.modelId,
        images: model.images ?? curated?.images ?? false,
        pdfs: model.pdfs ?? curated?.pdfs ?? false,
        tools: model.tools ?? curated?.tools ?? false,
      };
    }),
  );
}

/** The Host's entry for a `"provider:model"` id, and the Provider it sits under. */
function hostEntry(
  deps: Pick<AppDeps, "hostProviders">,
  id: string,
): { hostProvider: HostProvider; model: HostModel } | undefined {
  for (const hostProvider of deps.hostProviders) {
    const model = hostProvider.models.find(
      (entry) => `${hostProvider.provider}:${entry.modelId}` === id,
    );
    if (model) return { hostProvider, model };
  }
  return undefined;
}
