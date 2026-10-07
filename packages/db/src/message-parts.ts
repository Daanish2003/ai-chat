import { z } from "zod";

/**
 * The stored shape of a Message's `parts` (ADR 0001): our own zod union, versioned, never
 * TanStack AI's `UIMessage` parts. `@ai-chat/api`'s boundary module converts it.
 */

export const textPartSchema = z.object({ type: z.literal("text"), text: z.string() });

export const searchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  publishedDate: z.string().optional(),
});

/** One `web_search` tool call of a reply and how it went. Failures are states, never a Message error. */
export const webSearchPartSchema = z.object({
  type: z.literal("web_search"),
  toolCallId: z.string(),
  query: z.string(),
  state: z.enum(["running", "done", "error", "cancelled"]),
  results: z.array(searchResultSchema).max(5),
  errorReason: z.enum(["invalid_key", "quota_exhausted", "failed"]).optional(),
});

export const storedPartSchema = z.discriminatedUnion("type", [textPartSchema, webSearchPartSchema]);

export const storedPartsSchema = z.object({
  schemaVersion: z.literal(1),
  parts: z.array(storedPartSchema),
});

export type StoredPart = z.infer<typeof storedPartSchema>;
export type WebSearchPart = z.infer<typeof webSearchPartSchema>;
export type StoredParts = z.infer<typeof storedPartsSchema>;

export function storedParts(parts: StoredPart[]): StoredParts {
  return { schemaVersion: 1, parts };
}
