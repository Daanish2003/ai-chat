import type { WebSearchPart } from "@ai-chat/db/message-parts";
import { cn } from "@ai-chat/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, GlobeIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";

import { describeSearch, domainOf } from "@/lib/web-search";

/**
 * One web search in a reply: a slim line with its state. A search with results expands to each
 * result's title, domain and snippet.
 */
export function SearchRow({ search }: { search: WebSearchPart }) {
  const [open, setOpen] = useState(false);
  const { text, keySettings } = describeSearch(search);
  const expandable = search.results.length > 0;
  const failed = search.state === "error" || search.state === "cancelled";

  const line = (
    <>
      {search.state === "running" ? (
        <LoaderIcon className="size-3.5 shrink-0 animate-spin" aria-hidden />
      ) : (
        <GlobeIcon className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate">{text}</span>
    </>
  );

  return (
    <div className="max-w-[80ch] text-xs text-muted-foreground">
      {expandable ? (
        <button
          type="button"
          className="flex max-w-full items-center gap-1.5 hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {line}
          <ChevronRightIcon
            className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
      ) : (
        <p
          className={cn("flex items-center gap-1.5", failed && "italic")}
          role={search.state === "running" ? "status" : undefined}
        >
          {line}
          {keySettings && (
            <Link
              to="/settings/keys"
              className="font-medium not-italic underline underline-offset-2"
            >
              Key settings
            </Link>
          )}
        </p>
      )}
      {open && (
        <ol className="mt-2 space-y-2 border-l pl-3">
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
