import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ChatView } from "@/components/chat/chat-view";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/c/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.conversation.get.queryOptions({ input: { id: params.id } }),
    ),
  component: ConversationPage,
});

function ConversationPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(orpc.conversation.get.queryOptions({ input: { id } }));
  return <ChatView key={id} conversation={data} />;
}
