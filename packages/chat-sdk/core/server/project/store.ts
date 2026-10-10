import { conversation, project } from "../db/schema/chat";
import { and, count, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../deps";

type Deps = Pick<AppDeps, "db">;

/** How many Projects one user may have. */
export const projectLimit = 100;

/** The user's Project, or `undefined` when it doesn't exist or belongs to someone else. */
export async function findProject(deps: Deps, userId: string, id: string) {
  const [row] = await deps.db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)));
  return row;
}

/** How many Projects the user has. */
export async function countProjects(deps: Deps, userId: string) {
  const [row] = await deps.db
    .select({ total: count() })
    .from(project)
    .where(eq(project.userId, userId));
  return row?.total ?? 0;
}

/**
 * The user's Projects, newest activity first. A Project's activity is the later of its creation
 * and its newest Conversation's last Message.
 */
export async function listProjects(deps: Deps, userId: string) {
  const activity = sql`greatest(${project.createdAt}, (select max(${conversation.lastMessageAt}) from ${conversation} where ${conversation.projectId} = ${project.id}))`;
  return deps.db
    .select({ id: project.id, name: project.name })
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(activity), desc(project.id));
}
