import type { ProviderId } from "../credentials/services";

/**
 * The curated Model list: plain data, safe to import into the browser. Every `modelId` must be
 * in its adapter package's `*_MODELS` export (checked in `models.test.ts`). Capability flags
 * follow each package's model metadata.
 */

export type CuratedModel = {
  /** `"provider:model"`, as stored in `conversation.model` and `message.model`. */
  id: string;
  provider: ProviderId;
  modelId: string;
  label: string;
  images: boolean;
  pdfs: boolean;
  tools: boolean;
};

function model(
  provider: ProviderId,
  modelId: string,
  label: string,
  capabilities: Pick<CuratedModel, "images" | "pdfs" | "tools">,
): CuratedModel {
  return { id: `${provider}:${modelId}`, provider, modelId, label, ...capabilities };
}

const anthropic = { images: true, pdfs: true, tools: true };
const openai = { images: true, pdfs: false, tools: true };

export const curatedModels: CuratedModel[] = [
  model("anthropic", "claude-opus-5-5", "Claude Opus 5.5", anthropic),
  model("anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", anthropic),
  model("anthropic", "claude-fable-5-1", "Claude Fable 5.1", anthropic),
  model("anthropic", "claude-haiku-4-5", "Claude Haiku 4.5", anthropic),
  model("openai", "gpt-6.1-sol", "GPT-6.1 Sol", openai),
  model("openai", "gpt-6-luna", "GPT-6 Luna", openai),
  model("openai", "gpt-5.6", "GPT-5.6", openai),
  model("openai", "gpt-5.4-mini", "GPT-5.4 mini", openai),
];

/** The curated Model for a `"provider:model"` id, or `undefined`. */
export function findModel(id: string): CuratedModel | undefined {
  return curatedModels.find((model) => model.id === id);
}

/** The Model a new Conversation starts on when the Provider is the first one the user added. */
const providerDefaults: Partial<Record<ProviderId, string>> = {
  anthropic: "anthropic:claude-sonnet-5-5",
  openai: "openai:gpt-5.6",
};

/** The code default Model of `provider`: its chosen default, else its first curated Model. */
export function defaultModelFor(provider: ProviderId): string | undefined {
  return (
    providerDefaults[provider] ?? curatedModels.find((model) => model.provider === provider)?.id
  );
}
