import { numberSources } from "@ai-chat/api/shared/chat/sources";
import type { WebSearchPart } from "@ai-chat/db/message-parts";

/** The composer's Search toggle: whether search can be offered, is offered, and why. */
export function searchToggle({
  hasTavilyKey,
  modelTools,
  on,
}: {
  hasTavilyKey: boolean;
  modelTools: boolean;
  on: boolean;
}) {
  if (!hasTavilyKey) {
    return {
      available: false,
      enabled: false,
      tooltip: "Web search needs a Tavily key in Keys & settings",
    };
  }
  if (!modelTools) {
    return {
      available: false,
      enabled: false,
      tooltip: "This Model can't use tools, so it can't search the web",
    };
  }
  return { available: true, enabled: on, tooltip: on ? "Web search on" : "Web search off" };
}

const failureText: Record<NonNullable<WebSearchPart["errorReason"]>, string> = {
  invalid_key: "Search failed: Tavily rejected your key.",
  quota_exhausted: "Search failed: Tavily's monthly quota is used up.",
  failed: "Search failed.",
};

/** The one line a search row shows, and whether to link Key settings. */
export function describeSearch(search: WebSearchPart) {
  const query = `"${search.query}"`;
  switch (search.state) {
    case "running":
      return { text: `Searching the web for ${query}…`, keySettings: false };
    case "cancelled":
      return { text: "Search cancelled", keySettings: false };
    case "error": {
      const reason = search.errorReason ?? "failed";
      return { text: failureText[reason], keySettings: reason === "invalid_key" };
    }
    case "done": {
      const count = search.results.length;
      return {
        text:
          count === 0
            ? `No results for ${query}`
            : `Searched ${query} · ${count} ${count === 1 ? "source" : "sources"}`,
        keySettings: false,
      };
    }
  }
}

/**
 * The one line a row of back-to-back searches shows: a single search's own line, the search
 * still running, the last failure when none finished (`failed`), or "Searched 3 times · 12
 * sources" counting distinct Sources.
 */
export function describeSearches(searches: WebSearchPart[]) {
  const keySettings = searches.some((search) => describeSearch(search).keySettings);
  const running = searches.find((search) => search.state === "running");
  const failed = searches.every(
    (search) => search.state === "error" || search.state === "cancelled",
  );
  if (searches.length === 1 || running || failed) {
    return { text: describeSearch(running ?? searches.at(-1)!).text, keySettings, failed };
  }
  const count = numberSources(searches).length;
  const sources = count === 0 ? "no sources" : `${count} ${count === 1 ? "source" : "sources"}`;
  return { text: `Searched ${searches.length} times · ${sources}`, keySettings, failed };
}

/** A result's domain for display: the hostname without `www.`. */
export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
