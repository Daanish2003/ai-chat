import type { AppDeps, Credentials } from "../deps";
import { listCredentials, loadCredentials } from "./store";

type Deps = Pick<AppDeps, "db" | "keyEncryptionSecrets">;

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
