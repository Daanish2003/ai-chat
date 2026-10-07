import { numberSources } from "@ai-chat/api/chat/sources";
import type { WebSearchPart } from "@ai-chat/db/message-parts";
import { useEffect, useState } from "react";

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

const storageKey = "ai-chat:web-search";

/** Set this page session; storage may be blocked. */
let chosen: boolean | undefined;

/** Whether the user wants Search on, remembered in `localStorage` for this browser; on by default. */
export function readSearchPreference() {
  if (chosen !== undefined) return chosen;
  try {
    return localStorage.getItem(storageKey) !== "off";
  } catch {
    return true;
  }
}

/**
 * `readSearchPreference` as state, read after mounting so the server render and the first client
 * render agree.
 */
export function useSearchPreference() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(readSearchPreference()), []);
  const set = (value: boolean) => {
    chosen = value;
    setOn(value);
    try {
      localStorage.setItem(storageKey, value ? "on" : "off");
    } catch {
      // Storage blocked: remembered for this page session only.
    }
  };
  return [on, set] as const;
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
 * still running, or "Searched 3 times · 12 sources" counting distinct Sources.
 */
export function describeSearches(searches: WebSearchPart[]) {
  const keySettings = searches.some((search) => describeSearch(search).keySettings);
  const running = searches.find((search) => search.state === "running");
  if (searches.length === 1 || running) {
    return { text: describeSearch(running ?? searches[0]!).text, keySettings };
  }
  const count = numberSources(searches).length;
  const sources = count === 0 ? "no sources" : `${count} ${count === 1 ? "source" : "sources"}`;
  return { text: `Searched ${searches.length} times · ${sources}`, keySettings };
}

/** A result's domain for display: the hostname without `www.`. */
export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
