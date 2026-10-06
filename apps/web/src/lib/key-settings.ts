import type { CredentialSummary } from "@ai-chat/api/credentials/store";
import {
  type CredentialService,
  isCredentialService,
  type ProviderId,
  providers,
} from "@ai-chat/api/credentials/services";

export type ProviderRowStatus = "verified" | "unverified" | "missing" | "coming_soon";

export type ProviderRow = {
  id: ProviderId;
  label: string;
  status: ProviderRowStatus;
  hint: string | null;
  /** Set when the Provider's credentials can be saved. */
  service: CredentialService | null;
};

/** One Keys & settings row per Provider, in Provider order, from `credentials.list`. */
export function providerRows(credentials: CredentialSummary[]): ProviderRow[] {
  return providers.map(({ id, label }) => {
    if (!isCredentialService(id)) {
      return { id, label, status: "coming_soon", hint: null, service: null };
    }
    const saved = credentials.find((credential) => credential.service === id);
    if (!saved) return { id, label, status: "missing", hint: null, service: id };
    return {
      id,
      label,
      status: saved.verified ? "verified" : "unverified",
      hint: saved.hint,
      service: id,
    };
  });
}
