import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, projectMembers, projects, tasks, type Project, type ProjectMember, type User } from "@/db";

type Viewer = Pick<User, "id" | "role">;
export const PROJECT_MEMBER_ROLES = ["owner", "member", "viewer"] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

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
  source: "resolve" | "activity" | "manual" = "activity",
  defaultRole?: ProjectMemberRole
): Promise<void> {
  const now = new Date();
  const [existing] = await db
    .select({ source: projectMembers.source })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);

  if (existing) {
    await db
      .update(projectMembers)
      .set({
        source: existing.source === "manual" ? existing.source : source,
        lastSeenAt: now,
      })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    return;
  }

  const [memberCount] = await db
    .select({ value: count() })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  const role = defaultRole ?? (Number(memberCount.value) === 0 ? "owner" : "member");

  await db
    .insert(projectMembers)
    .values({
      projectId,
      userId,
      role,
      source,
      lastSeenAt: now,
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

export async function getProjectMembership(
  projectId: string,
  user: Viewer
): Promise<ProjectMember | null> {
  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)))
    .limit(1);
  return membership ?? null;
}

export async function canWriteProject(projectId: string, user: Viewer): Promise<boolean> {
  if (isAdminUser(user)) return true;
  const membership = await getProjectMembership(projectId, user);
  return membership?.role === "owner" || membership?.role === "member";
}

export async function canManageProjectMembers(projectId: string, user: Viewer): Promise<boolean> {
  if (isAdminUser(user)) return true;
  const membership = await getProjectMembership(projectId, user);
  return membership?.role === "owner";
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
