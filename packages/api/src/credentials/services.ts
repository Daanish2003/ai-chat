import { z } from "zod";

/**
 * Providers, their Provider credentials fields and help text. Plain data and zod only:
 * the web app imports it into the browser for the Keys & settings page.
 */

/** The 14 TanStack AI HTTP chat Providers, in the order Keys & settings lists them. */
export const providers = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "mistral", label: "Mistral" },
  { id: "groq", label: "Groq" },
  { id: "grok", label: "xAI Grok" },
  { id: "bedrock", label: "Amazon Bedrock" },
  { id: "cloudflare", label: "Cloudflare Workers AI" },
  { id: "byteplus", label: "BytePlus" },
  { id: "llmgateway", label: "LLM Gateway" },
  { id: "lovable", label: "Lovable" },
  { id: "vercel-gateway", label: "Vercel AI Gateway" },
  { id: "ollama", label: "Ollama" },
] as const;

export type ProviderId = (typeof providers)[number]["id"];

const apiKey = z.string().trim().min(1, "Enter an API key");

/** The field schema of each service whose credentials can be saved. */
export const credentialFieldSchemas = {
  anthropic: z.object({ apiKey }),
  openai: z.object({ apiKey }),
};

export type CredentialService = keyof typeof credentialFieldSchemas;

export const credentialServices = Object.keys(credentialFieldSchemas) as [
  CredentialService,
  ...CredentialService[],
];

/** How the Keys & settings form asks for each field, and the one-line help text. */
export const credentialForms: Record<
  CredentialService,
  { fields: { name: string; label: string; placeholder: string }[]; helpText: string }
> = {
  anthropic: {
    fields: [{ name: "apiKey", label: "API key", placeholder: "sk-ant-…" }],
    helpText: "Create a key in the Anthropic Console under Settings → API keys.",
  },
  openai: {
    fields: [{ name: "apiKey", label: "API key", placeholder: "sk-…" }],
    helpText: "Create a key in the OpenAI dashboard under API keys.",
  },
};

export function isCredentialService(service: string): service is CredentialService {
  return Object.hasOwn(credentialFieldSchemas, service);
}

export function providerLabel(service: string) {
  return providers.find((provider) => provider.id === service)?.label ?? service;
}

/** The masked hint the client sees instead of the key, e.g. "…abcd". */
export function credentialHint(fields: { apiKey: string }) {
  return `…${fields.apiKey.slice(-4)}`;
}
