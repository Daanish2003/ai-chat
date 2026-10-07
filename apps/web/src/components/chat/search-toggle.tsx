import { tavilyService } from "@ai-chat/api/credentials/services";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ai-chat/ui/components/tooltip";
import { cn } from "@ai-chat/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { GlobeIcon } from "lucide-react";

import { searchToggle, useSearchPreference } from "@/lib/web-search";
import { orpc } from "@/utils/orpc";

/**
 * Search for `model`: available with a Tavily key and a Model with tools; `enabled` is what a
 * send's `webSearch` carries (the server re-checks it).
 */
export function useWebSearch(model: string | null | undefined) {
  const credentials = useQuery(orpc.credentials.list.queryOptions());
  const models = useQuery(orpc.models.list.queryOptions());
  const [on, setOn] = useSearchPreference();
  const toggle = searchToggle({
    hasTavilyKey: credentials.data?.some((saved) => saved.service === tavilyService) ?? false,
    modelTools: models.data?.models.find((candidate) => candidate.id === model)?.tools ?? false,
    on,
  });
  return { ...toggle, on, setOn };
}

/** The composer's Search toggle; disabled with the reason in its tooltip when unavailable. */
export function SearchToggle({ search }: { search: ReturnType<typeof useWebSearch> }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-pressed={search.enabled}
        aria-disabled={!search.available}
        onClick={(event) => {
          // The composer focuses its textarea on clicks.
          event.stopPropagation();
          if (search.available) search.setOn(!search.on);
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
          search.enabled ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted",
          !search.available && "cursor-not-allowed opacity-50 hover:bg-transparent",
        )}
      >
        <GlobeIcon className="size-3.5" aria-hidden /> Search
      </TooltipTrigger>
      <TooltipContent>{search.tooltip}</TooltipContent>
    </Tooltip>
  );
}
