import type { AnyTextAdapter } from "@tanstack/ai";
import { type AnthropicChatModel, createAnthropicChat } from "@tanstack/ai-anthropic";
import { type BedrockConverseModels, createBedrockText } from "@tanstack/ai-bedrock";
import { createBytePlusText } from "@tanstack/ai-byteplus";
import { createCloudflareText } from "@tanstack/ai-cloudflare";
import { createGeminiChat, type GeminiTextModel } from "@tanstack/ai-gemini";
import { createGrokText } from "@tanstack/ai-grok";
import { createGroqText } from "@tanstack/ai-groq";
import { createLLMGatewayText } from "@tanstack/ai-llmgateway";
import { createLovableText } from "@tanstack/ai-lovable";
import { createMistralText } from "@tanstack/ai-mistral";
import { createOllamaChat } from "@tanstack/ai-ollama";
import { createOpenaiChat, type OpenAIChatModel } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { createVercelGatewayText } from "@tanstack/ai-vercel-gateway";

import type { Credentials } from "../deps";
import { findModel, isLiveListProvider } from "./models";

/** The model id type of an adapter factory. The ids are checked in `models.test.ts`. */
type ModelOf<Factory extends (model: never, ...rest: never[]) => unknown> = Parameters<Factory>[0];

/**
 * Builds the real TanStack AI text adapter for a `"provider:model"` id (curated, or from the live
 * OpenRouter or Ollama list) from the user's Provider credentials, each through its
 * explicit-credential factory. The production `deps.adapterFor`.
 */
export function adapterFor(model: string, credentials: Credentials): AnyTextAdapter {
  const separator = model.indexOf(":");
  const provider = model.slice(0, separator);
  const modelId = model.slice(separator + 1);
  if (separator < 0 || (!findModel(model) && !isLiveListProvider(provider))) {
    throw new Error(`"${model}" is not an available Model`);
  }

  if (provider === "ollama") {
    if (!credentials.host) throw new Error("The ollama credentials have no host");
    return createOllamaChat(modelId, credentials.host);
  }
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error(`The ${provider} credentials have no API key`);

  switch (provider) {
    case "anthropic":
      return createAnthropicChat(modelId as AnthropicChatModel, apiKey);
    case "openai":
      return createOpenaiChat(modelId as OpenAIChatModel, apiKey);
    case "gemini":
      return createGeminiChat(modelId as GeminiTextModel, apiKey);
    case "openrouter":
      return createOpenRouterText(modelId as ModelOf<typeof createOpenRouterText>, apiKey);
    case "mistral":
      return createMistralText(modelId as ModelOf<typeof createMistralText>, apiKey);
    case "groq":
      return createGroqText(modelId as ModelOf<typeof createGroqText>, apiKey);
    case "grok":
      return createGrokText(modelId as ModelOf<typeof createGrokText>, apiKey);
    case "bedrock":
      // The Converse API; `auth: "apikey"` keeps it off the server's AWS env credentials.
      return createBedrockText(modelId as BedrockConverseModels, apiKey, {
        region: credentials.region,
        auth: "apikey",
      });
    case "cloudflare":
      if (!credentials.accountId) throw new Error("The cloudflare credentials have no account id");
      return createCloudflareText(modelId, { accountId: credentials.accountId, apiKey });
    case "byteplus":
      return createBytePlusText(modelId as ModelOf<typeof createBytePlusText>, apiKey);
    case "llmgateway":
      return createLLMGatewayText(modelId as ModelOf<typeof createLLMGatewayText>, apiKey);
    case "lovable":
      return createLovableText(modelId as ModelOf<typeof createLovableText>, apiKey);
    case "vercel-gateway":
      return createVercelGatewayText(modelId as ModelOf<typeof createVercelGatewayText>, apiKey);
    default:
      throw new Error(`No adapter is available for the ${provider} Provider`);
  }
}
