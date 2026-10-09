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
  createdAt: Date;
};
