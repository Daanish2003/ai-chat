import type { CounterStore } from "./chat/counters";

/** A fixed window: at most `limit` hits per `windowSeconds`. */
export type RateLimit = { limit: number; windowSeconds: number };

/**
 * What `createChat` takes: each limited action may be overridden, and `false` turns that limit off.
 * Only Run starts are limited so far; the other actions of spec 87 join this type as they land.
 */
export type RateLimits = {
  /** Run starts, per user. */
  runStart?: RateLimit | false;
};

export type ResolvedRateLimits = { runStart: RateLimit | false };

export const defaultRateLimits: ResolvedRateLimits = {
  runStart: { limit: 20, windowSeconds: 60 },
};

/** The defaults, with each override in place. An override of `undefined` keeps the default. */
export function resolveRateLimits(overrides: RateLimits = {}): ResolvedRateLimits {
  return { runStart: overrides.runStart ?? defaultRateLimits.runStart };
}

/**
 * Counts one hit against a limit and returns the seconds to wait (for `Retry-After`) once the
 * window's count passes the limit, or `null` while the hit is allowed.
 */
export async function rateLimitedFor(
  counters: CounterStore,
  rule: RateLimit | false,
  key: string,
): Promise<number | null> {
  if (rule === false) return null;
  const { count, resetMs } = await counters.hit(key, rule.windowSeconds * 1000);
  if (count <= rule.limit) return null;
  return Math.max(1, Math.ceil(resetMs / 1000));
}
