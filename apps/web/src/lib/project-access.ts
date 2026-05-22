import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, projectMembers, projects, tasks, users, type Project, type ProjectMember, type User } from "@/db";

type Viewer = Pick<User, "id" | "role" | "teamOwnerId">;
export const PROJECT_MEMBER_ROLES = ["owner", "member", "viewer"] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export function isAdminUser(user: Viewer): boolean {
  return user.role === "admin";
}

function viewerTeamOwnerId(user: Viewer): string {
  return user.teamOwnerId ?? user.id;
}

export function visibleProjectsCondition(user: Viewer): SQL | undefined {
  if (isAdminUser(user)) return undefined;
  const teamOwnerId = viewerTeamOwnerId(user);
  return sql`(
    exists (
      select 1
      from ${projectMembers}
      where ${projectMembers.projectId} = ${projects.id}
        and ${projectMembers.userId} = ${user.id}
    )
    or exists (
      select 1
      from "project_members" as "team_project_member"
      inner join "users" as "team_project_user"
        on "team_project_user"."id" = "team_project_member"."user_id"
      where "team_project_member"."project_id" = ${projects.id}
        and coalesce("team_project_user"."team_owner_id", "team_project_user"."id") = ${teamOwnerId}
        and "team_project_user"."revoked_at" is null
    )
  )`;
}

export function visibleTasksCondition(user: Viewer): SQL | undefined {
  if (isAdminUser(user)) return undefined;
  const teamOwnerId = viewerTeamOwnerId(user);
  return sql`(
    exists (
      select 1
      from ${projectMembers}
      where ${projectMembers.projectId} = ${tasks.projectId}
        and ${projectMembers.userId} = ${user.id}
    )
    or exists (
      select 1
      from "users" as "team_task_user"
      where "team_task_user"."id" = ${tasks.userId}
        and coalesce("team_task_user"."team_owner_id", "team_task_user"."id") = ${teamOwnerId}
        and "team_task_user"."revoked_at" is null
    )
  )`;
}

export function visibleUsersCondition(user: Viewer): SQL | undefined {
  if (isAdminUser(user)) return undefined;
  return sql`(
    coalesce(${users.teamOwnerId}, ${users.id}) = ${viewerTeamOwnerId(user)}
    and ${users.revokedAt} is null
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

export async function isProjectMember(projectId: string, user: Viewer): Promise<boolean> {
  if (isAdminUser(user)) return true;
  return Boolean(await getProjectMembership(projectId, user));
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

  const rows = await db
    .select({ userId: users.id })
    .from(users)
    .where(
      and(
        isNull(users.revokedAt),
        sql`coalesce(${users.teamOwnerId}, ${users.id}) = ${viewerTeamOwnerId(user)}`
      )
    );

  return new Set(rows.map((row) => row.userId));
}
