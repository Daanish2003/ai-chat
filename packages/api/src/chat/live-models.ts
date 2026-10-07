import { OPENROUTER_CHAT_MODELS } from "@tanstack/ai-openrouter/model-meta";
import { z } from "zod";

import type { CuratedModel } from "./models";

/**
 * The live Model lists of OpenRouter and Ollama, fetched through `deps.fetch`. A list that
 * can't be fetched is empty: the picker just shows no Models for that Provider.
 */

const openRouterListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      architecture: z.object({ input_modalities: z.array(z.string()) }).optional(),
      supported_parameters: z.array(z.string()).optional(),
    }),
  ),
});

const ollamaTagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });

const openRouterTtlMs = 60 * 60_000;
const openRouterChatModels = new Set<string>(OPENROUTER_CHAT_MODELS);
/** The OpenRouter list per `fetch`, so tests (each with their own stub) don't share it. */
const openRouterCache = new WeakMap<typeof fetch, { expiresAt: number; models: CuratedModel[] }>();

/**
 * OpenRouter's chat Models that support tools (the adapter's `OPENROUTER_CHAT_MODELS` only),
 * cached for an hour. Images come from the input modalities; PDFs are off (Chat Completions).
 */
export async function openRouterModels(fetch: typeof globalThis.fetch): Promise<CuratedModel[]> {
  const cached = openRouterCache.get(fetch);
  if (cached && cached.expiresAt > Date.now()) return cached.models;

  const list = await fetchJson(fetch, "https://openrouter.ai/api/v1/models", openRouterListSchema);
  if (!list) return [];
  const models = list.data
    .filter(
      (entry) =>
        openRouterChatModels.has(entry.id) && entry.supported_parameters?.includes("tools"),
    )
    .map((entry) =>
      liveModel("openrouter", entry.id, entry.name, {
        images: entry.architecture?.input_modalities.includes("image") ?? false,
      }),
    );
  openRouterCache.set(fetch, { expiresAt: Date.now() + openRouterTtlMs, models });
  return models;
}

/** The Models installed on the user's Ollama host: text-only, with tools on. */
export async function ollamaModels(
  fetch: typeof globalThis.fetch,
  host: string,
): Promise<CuratedModel[]> {
  const tags = await fetchJson(fetch, `${host}/api/tags`, ollamaTagsSchema);
  return (tags?.models ?? []).map((entry) =>
    liveModel("ollama", entry.name, entry.name, { images: false }),
  );
}

function liveModel(
  provider: "openrouter" | "ollama",
  modelId: string,
  label: string,
  { images }: { images: boolean },
): CuratedModel {
  return {
    id: `${provider}:${modelId}`,
    provider,
    modelId,
    label,
    images,
    pdfs: false,
    tools: true,
  };
}

async function fetchJson<T>(
  fetch: typeof globalThis.fetch,
  url: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
