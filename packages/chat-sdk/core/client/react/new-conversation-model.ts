import { useQuery } from "@tanstack/react-query";

import { useChatAdapter, useChatLocation } from "./provider";

/**
 * The Model a new Conversation will be created with: the one picked in the top bar (kept in the
 * location, `?model=` in the web app), else the default from `models.list`.
 */
export function useNewConversationModel() {
  const { orpc, navigate } = useChatAdapter();
  const { newConversationModel: picked } = useChatLocation();
  const models = useQuery(orpc.models.list.queryOptions());
  return {
    model: picked ?? models.data?.defaultModel ?? undefined,
    setModel: (model: string) => navigate({ to: "new", model }, { replace: true }),
  };
}
