import { citationFor } from "@ai-chat/api/chat/citations";
import type { Source as NumberedSource } from "@ai-chat/api/chat/sources";
import { Source, SourceContent, SourceTrigger } from "@ai-chat/ui/components/prompt-kit/source";
import type { ComponentProps } from "react";

/** A Source's numbered chip, with a hover card showing its title and snippet. */
export function SourceChip({
  source,
  favicon = false,
}: {
  source: NumberedSource;
  favicon?: boolean;
}) {
  return (
    <Source href={source.url}>
      <SourceTrigger label={source.number} showFavicon={favicon} />
      <SourceContent title={source.title} description={source.snippet} />
    </Source>
  );
}

/** The numbered Source chips under a search row. */
export function SourceChips({ sources }: { sources: NumberedSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((source) => (
        <SourceChip key={source.number} source={source} favicon />
      ))}
    </div>
  );
}

/**
 * Markdown renderers for a reply's links: a link to one of this Message's Sources is that
 * Source's citation chip; any other link stays a plain link. All open in a new tab.
 */
export function citationComponents(sources: NumberedSource[]) {
  return {
    a: function ReplyLink({
      href,
      children,
      node: _node,
      ...props
    }: ComponentProps<"a"> & { node?: unknown }) {
      const source = citationFor(href, sources);
      if (source) {
        return (
          <span className="mx-0.5 inline-flex align-middle">
            <SourceChip source={source} />
          </span>
        );
      }
      return (
        <a {...props} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      );
    },
  };
}
