import { conversation } from "@ai-chat/db/schema/chat";
import { desc, eq } from "drizzle-orm";

import { listCredentials } from "../credentials/store";
import type { AppDeps } from "../deps";
import { type CuratedModel, curatedModels, defaultModelFor } from "./models";

type Deps = Pick<AppDeps, "db" | "keyEncryptionSecret">;

/**
 * The Models the user can chat with (those of Providers they have credentials for) and the
 * Model a new Conversation starts on: the Model of their most recent Conversation while it is
 * still available, else the code default of the first Provider they added.
 */
export async function listAvailableModels(
  deps: Deps,
  userId: string,
): Promise<{ models: CuratedModel[]; defaultModel: string | null }> {
  const services = (await listCredentials(deps, userId)).map((credential) => credential.service);
  const models = curatedModels.filter((model) => services.includes(model.provider));

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
  const defaultModel = recentModel ?? (firstProvider && defaultModelFor(firstProvider));

  return { models, defaultModel: defaultModel ?? null };
}
