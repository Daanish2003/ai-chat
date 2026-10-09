import type { AppRouterClient } from "../server/routers/index";

export type SearchHit = Awaited<ReturnType<AppRouterClient["search"]["query"]>>["hits"][number];

/** A hit's snippet cut into the text before, of and after the match, for a plain-text `<mark>`. */
export function splitSnippet({ text, match }: SearchHit["snippet"]) {
  return {
    before: text.slice(0, match.start),
    match: text.slice(match.start, match.end),
    after: text.slice(match.end),
  };
}

/**
 * The palette's Recent group: the newest 6 Conversations, or with a query, up to 20 whose title
 * contains it (case-insensitive; an untitled one is "Untitled").
 */
export function recentConversations<T extends { title: string | null }>(
  conversations: T[],
  q: string,
) {
  const needle = q.trim().toLowerCase();
  if (!needle) return conversations.slice(0, 6);
  return conversations
    .filter((c) => (c.title ?? "Untitled").toLowerCase().includes(needle))
    .slice(0, 20);
}

/**
 * What opening a search hit does next: highlight the Message once it's on screen, wait while the
 * Active Branch has it but the screen doesn't yet, or switch to the Branch through it.
 */
export function focusStep(
  target: string,
  onScreen: string[],
  activeBranch: string[],
): "highlight" | "wait" | "switch" {
  if (onScreen.includes(target)) return "highlight";
  if (activeBranch.includes(target)) return "wait";
  return "switch";
}
