import { project } from "../db/schema/chat";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { resolveModel } from "../chat/available-models";
import { resolveModelCall } from "../credentials/resolve";
import { unusableModelMessage } from "../../shared/credentials/services";
import {
  countProjectConversations,
  countProjects,
  deleteProject,
  findProject,
  listProjects,
  projectLimit,
} from "../project/store";
import { protectedProcedure } from "../procedures";
import { uuidv7 } from "../lib/uuidv7";

export const projectRouter = {
  /** The caller's Projects, newest activity first. */
  list: protectedProcedure.handler(async ({ context }) => ({
    items: await listProjects(context.deps, context.user.id),
  })),

  /** One of the caller's Projects; `defaultModel` is null when it has none. */
  get: protectedProcedure.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
    const row = await findProject(context.deps, context.user.id, input.id);
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    return { id: row.id, name: row.name, defaultModel: row.defaultModel };
  }),

  /**
   * Renames the caller's Project and sets its default Model. A `defaultModel` left out keeps the
   * stored one without checking it, so a Model that has since gone can't block a rename; a string
   * must be a Model the user can use now, and `null` clears it.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(100),
        defaultModel: z.string().nullish(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.user.id;
      if (!(await findProject(context.deps, userId, input.id))) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }
      const changes: { name: string; defaultModel?: string | null } = { name: input.name };
      if (typeof input.defaultModel === "string") {
        const model = await resolveModel(context.deps, userId, input.defaultModel);
        if (!model) {
          throw new ORPCError("BAD_REQUEST", {
            message: `"${input.defaultModel}" is not an available Model`,
          });
        }
        if (!(await resolveModelCall(context.deps, userId, model.id))) {
          throw new ORPCError("BAD_REQUEST", {
            message: unusableModelMessage(model.provider, context.deps.byok),
          });
        }
        changes.defaultModel = model.id;
      } else if (input.defaultModel === null) {
        changes.defaultModel = null;
      }
      await context.deps.db
        .update(project)
        .set(changes)
        .where(and(eq(project.id, input.id), eq(project.userId, userId)));
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

  /** How many Conversations the Project holds, for the delete confirmation. */
  conversationCount: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const count = await countProjectConversations(context.deps, context.user.id, input.id);
      if (count === undefined) throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      return { count };
    }),

  /**
   * Deletes the Project with its Conversations, Messages and Shared links, for good. Live Runs in
   * those Conversations stop first. Answers how many Conversations went.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const count = await deleteProject(context.deps, context.user.id, input.id);
      if (count === undefined) throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      return { count };
    }),
};
