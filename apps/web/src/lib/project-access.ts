import { and, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, projectMembers, projects, tasks, type Project, type User } from "@/db";

type Viewer = Pick<User, "id" | "role">;

export function isAdminUser(user: Viewer): boolean {
  return user.role === "admin";
}

export function visibleProjectsCondition(user: Viewer): SQL | undefined {
  if (isAdminUser(user)) return undefined;
  return sql`exists (
    select 1
    from ${projectMembers}
    where ${projectMembers.projectId} = ${projects.id}
      and ${projectMembers.userId} = ${user.id}
  )`;
}

export function visibleTasksCondition(user: Viewer): SQL | undefined {
  if (isAdminUser(user)) return undefined;
  return sql`exists (
    select 1
    from ${projectMembers}
    where ${projectMembers.projectId} = ${tasks.projectId}
      and ${projectMembers.userId} = ${user.id}
  )`;
}

export async function ensureProjectMember(
  projectId: string,
  userId: string,
  source: "resolve" | "activity" | "manual" = "activity"
): Promise<void> {
  await db
    .insert(projectMembers)
    .values({
      projectId,
      userId,
      source,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: {
        source,
        lastSeenAt: new Date(),
      },
    });
}

export async function getVisibleProject(projectId: string, user: Viewer): Promise<Project | null> {
  const visibility = visibleProjectsCondition(user);
  const [project] = await db
    .select()
    .from(projects)
    .where(visibility ? and(eq(projects.id, projectId), visibility) : eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

export async function canAccessProject(projectId: string, user: Viewer): Promise<boolean> {
  return Boolean(await getVisibleProject(projectId, user));
}

export async function listVisibleProjectMemberUserIds(user: Viewer): Promise<Set<string> | null> {
  if (isAdminUser(user)) return null;

  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, user.id));

  const projectIds = memberships.map((membership) => membership.projectId);
  if (projectIds.length === 0) return new Set([user.id]);

  const rows = await db
    .selectDistinct({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, projectIds));

  return new Set(rows.map((row) => row.userId));
}
