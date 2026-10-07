import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

/**
 * The Model a new Conversation (`/c`) will be created with: the one picked in the top bar
 * (kept in the `?model=` search param), else the default from `models.list`.
 */
export function useNewConversationModel() {
  const { model: picked } = useSearch({ strict: false });
  const navigate = useNavigate();
  const models = useQuery(orpc.models.list.queryOptions());
  return {
    model: picked ?? models.data?.defaultModel ?? undefined,
    setModel: (model: string) => navigate({ to: "/c", search: { model }, replace: true }),
  };
}
