import type { WebSearchPart } from "@ai-chat/db/message-parts";
import { cn } from "@ai-chat/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, GlobeIcon, LoaderIcon } from "lucide-react";
import { useId, useState } from "react";

import { describeSearch, domainOf } from "@/lib/web-search";

/**
 * One web search in a reply: a slim line with its state, announced as it changes. A search with
 * results expands to each result's title, domain and snippet.
 */
export function SearchRow({ search }: { search: WebSearchPart }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { text, keySettings } = describeSearch(search);
  const expandable = search.results.length > 0;

  return (
    <div className="max-w-[80ch] text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        {search.state === "running" ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <GlobeIcon className="size-3.5 shrink-0" aria-hidden />
        )}
        <span
          role="status"
          className={cn(
            "truncate",
            (search.state === "error" || search.state === "cancelled") && "italic",
          )}
        >
          {expandable ? (
            <button
              type="button"
              className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((value) => !value)}
            >
              {text}
              <ChevronRightIcon
                className={cn("ml-1 inline size-3.5 transition-transform", open && "rotate-90")}
                aria-hidden
              />
            </button>
          ) : (
            text
          )}
        </span>
        {keySettings && (
          <Link to="/settings/keys" className="font-medium underline underline-offset-2">
            Key settings
          </Link>
        )}
      </div>
      {open && (
        <ol id={listId} className="mt-2 space-y-2 border-l pl-3">
          {search.results.map((result) => (
            <li key={result.url} className="space-y-0.5">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="font-medium text-foreground hover:underline"
              >
                {result.title}
              </a>
              <span className="ml-2">{domainOf(result.url)}</span>
              <p className="line-clamp-2">{result.snippet}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
