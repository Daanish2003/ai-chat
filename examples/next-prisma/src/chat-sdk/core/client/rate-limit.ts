/** A Run the server refused for its rate limit (spec 87). `retryAfterSeconds` comes from `Retry-After`. */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Too many messages; try again in ${retryAfterSeconds} seconds`);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The `fetch` a Run's connection uses: a 429 throws a `RateLimitedError` carrying the retry time,
 * and every other response passes through unchanged.
 */
export const runFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status !== 429) return response;
  const seconds = Number(response.headers.get("Retry-After"));
  throw new RateLimitedError(Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1);
};

/**
 * The `RateLimitedError` behind a failed send, if there is one. The connection wraps a failed fetch
 * in its own error, so this follows the `cause` chain.
 */
export function rateLimitedErrorOf(error: unknown): RateLimitedError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof RateLimitedError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}
