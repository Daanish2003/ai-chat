import { project } from "../db/schema/chat";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { countProjects, findProject, listProjects, projectLimit } from "../project/store";
import { protectedProcedure } from "../procedures";
import { uuidv7 } from "../lib/uuidv7";

export const projectRouter = {
  /** The caller's Projects, newest activity first. */
  list: protectedProcedure.handler(async ({ context }) => ({
    items: await listProjects(context.deps, context.user.id),
  })),

  /** One of the caller's Projects. */
  get: protectedProcedure.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
    const row = await findProject(context.deps, context.user.id, input.id);
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    return { id: row.id, name: row.name };
  }),

  /** Creates a Project. A name is 1 to 100 characters once trimmed; a user has at most 100 Projects. */
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .handler(async ({ context, input }) => {
      if ((await countProjects(context.deps, context.user.id)) >= projectLimit) {
        throw new ORPCError("BAD_REQUEST", {
          message: `You can have at most ${projectLimit} Projects`,
        });
      }
      const id = uuidv7();
      await context.deps.db
        .insert(project)
        .values({ id, userId: context.user.id, name: input.name });
      return { id };
    }),
};
