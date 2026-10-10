import { Button, buttonVariants } from "@/components/ui/button";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useChatAdapter, useOrpc } from "../../core/client/react/provider";
import { ConversationRow } from "../shell/conversation-panel";

/** A Project: its name, its Conversations (newest Message first) and "New chat in this Project". */
export function ProjectPage({ projectId }: { projectId: string }) {
  const orpc = useOrpc();
  const { Link } = useChatAdapter();
  const project = useQuery(orpc.project.get.queryOptions({ input: { id: projectId } }));
  const conversations = useInfiniteQuery(
    orpc.conversation.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, projectId }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );
  const rows = conversations.data?.pages.flatMap((page) => page.items) ?? [];

  if (project.error || conversations.error) {
    return <p className="p-6 text-sm text-muted-foreground">This Project can&apos;t be opened.</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="truncate text-lg font-semibold">{project.data?.name ?? "Project"}</h1>
        <Link page={{ to: "new", projectId }} className={buttonVariants({ size: "sm" })}>
          New chat in this Project
        </Link>
      </header>
      {conversations.isSuccess && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No Conversations in this Project yet</p>
      )}
      {rows.length > 0 && (
        <ul className="overflow-hidden rounded-md border">
          {rows.map((row) => (
            <ConversationRow key={row.id} conversation={row} />
          ))}
        </ul>
      )}
      {conversations.hasNextPage && (
        <Button
          variant="outline"
          disabled={conversations.isFetchingNextPage}
          onClick={() => void conversations.fetchNextPage()}
        >
          {conversations.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
