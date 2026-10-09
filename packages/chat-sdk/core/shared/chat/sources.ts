import type { WebSearchPart } from "../message-parts";
import type { MessagePart } from "@tanstack/ai";

import { webSearchOf } from "./web-search";

/**
 * A reply's Sources and how its parts group for display. Computed by the renderer from the
 * Message's parts, never stored. No server code: safe to import into the browser.
 */

/** One web page a reply's searches returned, numbered per Message. */
export type Source = { number: number; url: string; title: string; snippet: string };

/** A reply's parts as shown, in stream order: text, or a row of back-to-back searches. */
export type ReplySegment =
  | { type: "text"; key: string; content: string }
  | { type: "searches"; key: string; searches: WebSearchPart[] };

/**
 * The key two URLs share when they are the same Source: the URL without its fragment or a
 * trailing slash.
 */
export function sourceKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href.replace(/\/+$/, "");
  } catch {
    return url;
  }
}

/** The Sources of the given searches, numbered by first appearance and deduped by URL. */
export function numberSources(searches: WebSearchPart[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const result of searches.flatMap((search) => search.results)) {
    const key = sourceKey(result.url);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      number: sources.length + 1,
      url: result.url,
      title: result.title,
      snippet: result.snippet,
    });
  }
  return sources;
}

/** Every Source of a Message's parts, numbered across all its searches. */
export function sourcesOf(parts: MessagePart[]): Source[] {
  return numberSources(parts.map(webSearchOf).filter((search) => search !== null));
}

/**
 * A reply's text and searches in stream order. Back-to-back searches merge into one segment;
 * only non-empty text separates them. Other parts (thinking) are shown elsewhere.
 */
export function replySegments(parts: MessagePart[]): ReplySegment[] {
  const segments: ReplySegment[] = [];
  parts.forEach((part, index) => {
    if (part.type === "text") {
      if (part.content)
        segments.push({ type: "text", key: `text-${index}`, content: part.content });
      return;
    }
    const search = webSearchOf(part);
    if (!search) return;
    const last = segments.at(-1);
    if (last?.type === "searches") last.searches.push(search);
    else segments.push({ type: "searches", key: search.toolCallId, searches: [search] });
  });
  return segments;
}
