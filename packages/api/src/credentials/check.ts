import type { CredentialService } from "./services";
import { providerLabel } from "./services";

export type CheckRejectionReason = "invalid_key" | "provider_error";

export type CheckResult =
  | { status: "verified" }
  | { status: "rejected"; reason: CheckRejectionReason; message: string };

/** The cheap authenticated call that proves a key works, per service. */
const checkRequests: Record<
  CredentialService,
  (fields: { apiKey: string }) => { url: string; headers: Record<string, string> }
> = {
  anthropic: ({ apiKey }) => ({
    url: "https://api.anthropic.com/v1/models?limit=1",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  }),
  openai: ({ apiKey }) => ({
    url: "https://api.openai.com/v1/models",
    headers: { authorization: `Bearer ${apiKey}` },
  }),
};

/**
 * Checks Provider credentials with one authenticated request through `fetch` (`deps.fetch`).
 * A 429 counts as verified: the key authenticated, the account is only busy.
 */
export async function checkCredentials(
  service: CredentialService,
  fields: { apiKey: string },
  fetch: typeof globalThis.fetch,
): Promise<CheckResult> {
  const label = providerLabel(service);
  const { url, headers } = checkRequests[service](fields);

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    return {
      status: "rejected",
      reason: "provider_error",
      message: `Couldn't reach ${label} to check the key. Try again.`,
    };
  }
  await response.body?.cancel();

  if (response.ok || response.status === 429) return { status: "verified" };
  if (response.status === 401 || response.status === 403) {
    return {
      status: "rejected",
      reason: "invalid_key",
      message: `${label} rejected this API key.`,
    };
  }
  return {
    status: "rejected",
    reason: "provider_error",
    message: `Couldn't check the key with ${label} (HTTP ${response.status}). Try again.`,
  };
}
