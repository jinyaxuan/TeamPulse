import { and, count, desc, eq, gt, gte, isNull, max, or, sql } from "drizzle-orm";
import { db, devices, projectMembers, projectMessages, projects, tasks, users, type User } from "@/db";
import { visibleTasksCondition, visibleUsersCondition } from "@/lib/project-access";
import { nonTestProjectCondition, nonTestUserCondition } from "@/lib/test-data";

type Viewer = Pick<User, "id" | "role" | "teamOwnerId">;

export type TeamMemberSummary = {
  id: string;
  name: string;
  display_name: string | null;
  email: string | null;
  role: string;
  created_at: Date;
  revoked_at: Date | null;
  active_device_count: number;
  total_device_count: number;
  active_task_count: number;
  task_count: number;
  done_count: number;
  abandoned_count: number;
  last_active: Date | null;
};

export type TeamMemberDevice = {
  id: string;
  hostname: string | null;
  os: string | null;
  git_email: string | null;
  status: string;
  registered_at: Date;
  approved_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

export type TeamMemberProject = {
  id: string;
  display_name: string | null;
  git_remote_url: string | null;
  role: string;
  source: string;
  joined_at: Date;
  last_seen_at: Date;
  active_task_count: number;
  last_task_at: Date | null;
};

export type TeamMemberTask = {
  id: string;
  project_id: string;
  project_name: string | null;
  client: string;
  intent: string;
  status: string;
  branch: string | null;
  files_touched: string[];
  started_at: Date;
  ended_at: Date | null;
  heartbeat_at: Date;
  summary: string | null;
};

export type TeamMemberMessage = {
  id: string;
  project_id: string;
  project_name: string | null;
  thread_key: string;
  body: string;
  created_at: Date;
  author_name: string | null;
  author_display_name: string | null;
  target_user_id: string | null;
};

export type TeamMemberDetail = {
  member: TeamMemberSummary;
  devices: TeamMemberDevice[];
  projects: TeamMemberProject[];
  activeTasks: TeamMemberTask[];
  recentTasks: TeamMemberTask[];
  recentMessages: TeamMemberMessage[];
};

const activeCutoff = () => new Date(Date.now() - 15 * 60 * 1000);
const recentCutoff = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
type TeamMemberQueryOptions = {
  includeTestData?: boolean;
};

export async function getVisibleTeamMember(
  viewer: Viewer,
  memberId: string,
  options: TeamMemberQueryOptions = {}
): Promise<TeamMemberSummary | null> {
  const visibility = visibleUsersCondition(viewer);
  const recentSince = recentCutoff();
  const taskVisibility = visibleTasksCondition(viewer);

  const [member] = await db
    .select({
      id: users.id,
      name: users.name,
      display_name: users.displayName,
      email: users.email,
      role: users.role,
      created_at: users.createdAt,
      revoked_at: users.revokedAt,
      task_count: count(tasks.id),
      done_count: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'done')::int`.as("done_count"),
      abandoned_count: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'abandoned')::int`.as("abandoned_count"),
      last_active: max(tasks.heartbeatAt),
    })
    .from(users)
    .leftJoin(
      tasks,
      and(
        eq(tasks.userId, users.id),
        gte(tasks.startedAt, recentSince),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(users.id, memberId),
        isNull(users.revokedAt),
        ...(options.includeTestData ? [] : [nonTestUserCondition(), nonTestProjectCondition()]),
        ...(visibility ? [visibility] : [])
      )
    )
    .groupBy(users.id)
    .limit(1);

  if (!member) return null;

  const [deviceCounts] = await db
    .select({
      total_device_count: count(devices.id),
      active_device_count: sql<number>`COUNT(*) FILTER (WHERE ${devices.status} = 'active')::int`
        .as("active_device_count"),
    })
    .from(devices)
    .where(eq(devices.userId, member.id));

  const [activeTaskCount] = await db
    .select({ value: count(tasks.id) })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.userId, member.id),
        eq(tasks.status, "active"),
        gt(tasks.heartbeatAt, activeCutoff()),
        ...(options.includeTestData ? [] : [nonTestProjectCondition()]),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    );

  return {
    ...member,
    active_device_count: Number(deviceCounts?.active_device_count ?? 0),
    total_device_count: Number(deviceCounts?.total_device_count ?? 0),
    active_task_count: Number(activeTaskCount?.value ?? 0),
    task_count: Number(member.task_count),
    done_count: Number(member.done_count),
    abandoned_count: Number(member.abandoned_count),
  };
}

export async function getTeamMemberDetail(
  viewer: Viewer,
  memberId: string,
  options: TeamMemberQueryOptions = {}
): Promise<TeamMemberDetail | null> {
  const member = await getVisibleTeamMember(viewer, memberId, options);
  if (!member) return null;

  const taskVisibility = visibleTasksCondition(viewer);
  const activeSince = activeCutoff();
  const recentSince = recentCutoff();

  const [deviceRows, projectRows, activeTaskRows, recentTaskRows, messageRows] = await Promise.all([
    db
      .select({
        id: devices.id,
        hostname: devices.hostname,
        os: devices.os,
        git_email: devices.gitEmail,
        status: devices.status,
        registered_at: devices.registeredAt,
        approved_at: devices.approvedAt,
        last_used_at: devices.lastUsedAt,
        revoked_at: devices.revokedAt,
      })
      .from(devices)
      .where(eq(devices.userId, member.id))
      .orderBy(desc(devices.lastUsedAt), desc(devices.approvedAt), desc(devices.registeredAt)),

    db
      .select({
        id: projects.id,
        display_name: projects.displayName,
        git_remote_url: projects.gitRemoteUrl,
        role: projectMembers.role,
        source: projectMembers.source,
        joined_at: projectMembers.createdAt,
        last_seen_at: projectMembers.lastSeenAt,
        last_task_at: max(tasks.heartbeatAt),
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .leftJoin(
        tasks,
        and(
          eq(tasks.projectId, projects.id),
          eq(tasks.userId, member.id),
          ...(taskVisibility ? [taskVisibility] : [])
        )
      )
      .where(
        and(
          eq(projectMembers.userId, member.id),
          ...(options.includeTestData ? [] : [nonTestProjectCondition()])
        )
      )
      .groupBy(projects.id, projectMembers.projectId, projectMembers.userId)
      .orderBy(desc(projectMembers.lastSeenAt))
      .limit(30),

    db
      .select(taskSelection)
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, member.id),
          eq(tasks.status, "active"),
          gt(tasks.heartbeatAt, activeSince),
          ...(options.includeTestData ? [] : [nonTestProjectCondition()]),
          ...(taskVisibility ? [taskVisibility] : [])
        )
      )
      .orderBy(desc(tasks.heartbeatAt))
      .limit(20),

    db
      .select(taskSelection)
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.userId, member.id),
          gt(tasks.startedAt, recentSince),
          ...(options.includeTestData ? [] : [nonTestProjectCondition()]),
          ...(taskVisibility ? [taskVisibility] : [])
        )
      )
      .orderBy(desc(tasks.startedAt))
      .limit(30),

    db
      .select({
        id: projectMessages.id,
        project_id: projectMessages.projectId,
        project_name: projects.displayName,
        thread_key: projectMessages.threadKey,
        body: projectMessages.body,
        created_at: projectMessages.createdAt,
        author_name: users.name,
        author_display_name: users.displayName,
        target_user_id: projectMessages.targetUserId,
      })
      .from(projectMessages)
      .innerJoin(projects, eq(projectMessages.projectId, projects.id))
      .leftJoin(users, eq(projectMessages.authorId, users.id))
      .where(
        and(
          or(eq(projectMessages.authorId, member.id), eq(projectMessages.targetUserId, member.id))!,
          ...(options.includeTestData ? [] : [nonTestProjectCondition()])
        )
      )
      .orderBy(desc(projectMessages.createdAt))
      .limit(10),
  ]);

  return {
    member,
    devices: deviceRows,
    projects: await attachActiveProjectCounts(projectRows, member.id, activeSince, taskVisibility, options),
    activeTasks: activeTaskRows,
    recentTasks: recentTaskRows,
    recentMessages: messageRows,
  };
}

const taskSelection = {
  id: tasks.id,
  project_id: tasks.projectId,
  project_name: projects.displayName,
  client: tasks.client,
  intent: tasks.intent,
  status: tasks.status,
  branch: tasks.branch,
  files_touched: tasks.filesTouched,
  started_at: tasks.startedAt,
  ended_at: tasks.endedAt,
  heartbeat_at: tasks.heartbeatAt,
  summary: tasks.summary,
};

async function attachActiveProjectCounts<T extends Omit<TeamMemberProject, "active_task_count">>(
  projectRows: T[],
  userId: string,
  activeSince: Date,
  taskVisibility: ReturnType<typeof visibleTasksCondition>,
  options: TeamMemberQueryOptions
): Promise<TeamMemberProject[]> {
  if (projectRows.length === 0) return [];

  const activeRows = await db
    .select({
      project_id: tasks.projectId,
      active_task_count: count(tasks.id),
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "active"),
        gt(tasks.heartbeatAt, activeSince),
        ...(options.includeTestData ? [] : [nonTestProjectCondition()]),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .groupBy(tasks.projectId);

  const activeCountByProject = new Map(
    activeRows.map((row) => [row.project_id, Number(row.active_task_count)])
  );

  return projectRows.map((project) => ({
    ...project,
    active_task_count: activeCountByProject.get(project.id) ?? 0,
  }));
}
