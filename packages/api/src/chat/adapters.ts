import type { AnyTextAdapter } from "@tanstack/ai";
import { type AnthropicChatModel, createAnthropicChat } from "@tanstack/ai-anthropic";
import { createOpenaiChat, type OpenAIChatModel } from "@tanstack/ai-openai";

import type { Credentials } from "../deps";
import { findModel } from "./models";

/**
 * Builds the real TanStack AI text adapter for a curated `"provider:model"` id from the user's
 * Provider credentials. The production `deps.adapterFor`.
 */
export function adapterFor(model: string, credentials: Credentials): AnyTextAdapter {
  const curated = findModel(model);
  if (!curated) throw new Error(`"${model}" is not an available Model`);
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error(`The ${curated.provider} credentials have no API key`);

  switch (curated.provider) {
    case "anthropic":
      return createAnthropicChat(curated.modelId as AnthropicChatModel, apiKey);
    case "openai":
      return createOpenaiChat(curated.modelId as OpenAIChatModel, apiKey);
    default:
      throw new Error(`No adapter is available for the ${curated.provider} Provider yet`);
  }
}
