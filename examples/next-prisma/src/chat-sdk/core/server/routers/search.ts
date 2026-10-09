import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../procedures";
import { decodeCursor, searchMessages } from "../search/query";
import { minSearchLength } from "../../shared/search/text";

export const searchRouter = {
  /**
   * The caller's Messages containing `q` (2+ characters, case-insensitive), on every Branch,
   * newest first, in pages of 50. Pass the previous page's `nextCursor` for the next one.
   */
  query: protectedProcedure
    .input(
      z.object({
        q: z.string().trim().min(minSearchLength).max(200),
        cursor: z.string().optional(),
      }),
    )
    .handler(({ context, input }) => {
      const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
      if (input.cursor !== undefined && !cursor) {
        throw new ORPCError("BAD_REQUEST", { message: "Invalid cursor" });
      }
      return searchMessages(context.deps, context.user.id, input.q, cursor);
    }),
};
