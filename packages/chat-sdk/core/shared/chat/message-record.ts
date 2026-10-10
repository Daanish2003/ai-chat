/** Tokens a Run used, summed over its model iterations (input includes cached tokens). */
export type MessageUsage = {
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  /** True when the Provider reported no usage (a stopped or failed reply) and this is an estimate. */
  estimated: boolean;
};

/**
 * A stored Message, as the isomorphic code reads it. The server's row type is assignable to it,
 * so shared code never imports from `core/server`.
 */
export type MessageRecord = {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  parts: unknown;
  model: string | null;
  status: "streaming" | "complete" | "stopped" | "error";
  error: string | null;
  errorReason: "invalid_key" | "rate_limited" | "provider_error" | null;
  /** Tokens the Run used, for display only; null on user Messages and on older Runs. */
  usage: MessageUsage | null;
  createdAt: Date;
};
