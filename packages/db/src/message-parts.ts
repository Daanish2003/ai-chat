import { z } from "zod";

/**
 * The stored shape of a Message's `parts` (ADR 0001): our own zod union, versioned, never
 * TanStack AI's `UIMessage` parts. `@ai-chat/api`'s boundary module converts it.
 */

export const textPartSchema = z.object({ type: z.literal("text"), text: z.string() });

export const storedPartSchema = z.discriminatedUnion("type", [textPartSchema]);

export const storedPartsSchema = z.object({
  schemaVersion: z.literal(1),
  parts: z.array(storedPartSchema),
});

export type StoredPart = z.infer<typeof storedPartSchema>;
export type StoredParts = z.infer<typeof storedPartsSchema>;

export function storedParts(parts: StoredPart[]): StoredParts {
  return { schemaVersion: 1, parts };
}
