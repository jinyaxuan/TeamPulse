import { and, eq } from "drizzle-orm";
import {
  db,
  devices,
  projectMembers,
  workItems,
  type User,
  type WorkItem,
} from "@/db";
import { ApiError } from "@/lib/api";
import { publishPresence } from "@/lib/presence";
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_STATUSES,
  REVIEW_POLICIES,
  isValidWorkItemParent,
  type WorkItemKind,
  type WorkItemStatus,
  type ReviewPolicy,
} from "@/lib/work-item-state";
export {
  WORK_ITEM_KINDS,
  WORK_ITEM_STATUSES,
  REVIEW_POLICIES,
  canTransition,
  calculateAcceptance,
  statusAfterAssignment,
} from "@/lib/work-item-state";
import {
  canManageProjectMembers,
  canWriteProject,
  getVisibleProject,
  isProjectMember,
} from "@/lib/project-access";

export type { WorkItemKind, WorkItemStatus, ReviewPolicy };

type Viewer = Pick<User, "id" | "role" | "teamOwnerId">;

export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const [item] = await db.select().from(workItems).where(eq(workItems.id, id)).limit(1);
  return item ?? null;
}

export async function requireVisibleWorkItem(
  id: string,
  user: Viewer
): Promise<WorkItem> {
  const item = await getWorkItem(id);
  if (!item) throw new ApiError("工作项不存在", 404);
  const project = await getVisibleProject(item.projectId, user);
  if (!project) throw new ApiError("项目不存在", 404);
  return item;
}

export async function requireVisibleProjectForWorkItems(projectId: string, user: Viewer) {
  const project = await getVisibleProject(projectId, user);
  if (!project) throw new ApiError("项目不存在", 404);
  return project;
}

export async function requireProjectWrite(projectId: string, user: Viewer): Promise<void> {
  if (!(await canWriteProject(projectId, user))) {
    throw new ApiError("你在该项目中是只读角色，不能修改工作项", 403);
  }
}

export async function requireProjectMember(projectId: string, user: Viewer): Promise<void> {
  if (!(await isProjectMember(projectId, user))) {
    throw new ApiError("只有项目成员可以执行此操作", 403);
  }
}

export async function requireProjectManager(projectId: string, user: Viewer): Promise<void> {
  if (!(await canManageProjectMembers(projectId, user))) {
    throw new ApiError("只有项目 owner 或管理员可以执行此操作", 403);
  }
}

export async function resolveWorkItemAssignee(
  projectId: string,
  userId: string | null | undefined,
  deviceId: string | null | undefined
): Promise<{ userId: string; deviceId: string | null } | null> {
  if (!userId && !deviceId) return null;
  if (!userId && deviceId) throw new ApiError("指定 Agent 时必须同时指定 assignee_user_id", 400);

  const [member] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId!)))
    .limit(1);
  if (!member) throw new ApiError("负责人不是该项目成员", 400);

  if (!deviceId) return { userId: userId!, deviceId: null };
  const [device] = await db
    .select({ id: devices.id, userId: devices.userId, status: devices.status })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);
  if (!device || device.userId !== userId || device.status !== "active") {
    throw new ApiError("Agent 设备不存在、未激活或不属于负责人", 400);
  }
  return { userId: userId!, deviceId: device.id };
}

export async function resolveWorkItemReviewer(
  projectId: string,
  userId: string | null | undefined,
  deviceId: string | null | undefined,
  policy: ReviewPolicy
): Promise<{ userId: string | null; deviceId: string | null }> {
  if (userId) {
    const [member] = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    if (!member) throw new ApiError("验收人不是该项目成员", 400);
  }
  if (!deviceId) return { userId: userId ?? null, deviceId: null };
  if (policy === "human") throw new ApiError("人工验收策略不能指定 Agent 设备", 400);
  const [device] = await db
    .select({ id: devices.id, userId: devices.userId, status: devices.status })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);
  if (!device || !device.userId || device.status !== "active") {
    throw new ApiError("评审 Agent 设备不存在或未激活", 400);
  }
  const [deviceOwnerMember] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, device.userId)))
    .limit(1);
  if (!deviceOwnerMember) throw new ApiError("评审 Agent 不属于该项目成员", 400);
  return { userId: userId ?? null, deviceId: device.id };
}

export function ensureVersion(expected: number | undefined, actual: number): void {
  if (expected === undefined || expected !== actual) {
    throw new ApiError("工作项已被其他人更新，请刷新后重试", 409);
  }
}

export function isWorkItemStatus(value: string): value is WorkItemStatus {
  return (WORK_ITEM_STATUSES as readonly string[]).includes(value);
}

export function toWorkItemResponse(item: WorkItem) {
  return {
    id: item.id,
    project_id: item.projectId,
    parent_id: item.parentId,
    kind: item.kind,
    title: item.title,
    description: item.description,
    acceptance_criteria: item.acceptanceCriteria,
    status: item.status,
    stage: item.status,
    priority: item.priority,
    due_at: item.dueAt,
    dueAt: item.dueAt,
    assignee_user_id: item.assigneeUserId,
    assignee_id: item.assigneeUserId,
    assigneeId: item.assigneeUserId,
    assignee_device_id: item.assigneeDeviceId,
    reviewer_user_id: item.reviewerUserId,
    reviewer_id: item.reviewerUserId,
    reviewerId: item.reviewerUserId,
    reviewer_device_id: item.reviewerDeviceId,
    review_policy: item.reviewPolicy,
    acceptance_policy: item.reviewPolicy,
    acceptancePolicy: item.reviewPolicy,
    created_by: item.createdBy,
    version: item.version,
    submission_attempt: item.submissionAttempt,
    submissionAttempt: item.submissionAttempt,
    created_at: item.createdAt,
    createdAt: item.createdAt,
    updated_at: item.updatedAt,
    updatedAt: item.updatedAt,
    submitted_at: item.submittedAt,
    submittedAt: item.submittedAt,
    accepted_at: item.acceptedAt,
    acceptedAt: item.acceptedAt,
  };
}

export function assertSameProject(item: WorkItem, projectId: string): void {
  if (item.projectId !== projectId) {
    throw new ApiError("工作项不属于该项目", 404);
  }
}

export function publishWorkItemUpdate(input: {
  projectId: string;
  workItemId: string;
  actorUserId: string | null;
  status: string;
  version: number;
  eventType: string;
}): void {
  publishPresence({
    type: "work_item.updated",
    project_id: input.projectId,
    work_item_id: input.workItemId,
    actor_user_id: input.actorUserId,
    status: input.status,
    version: input.version,
    event_type: input.eventType,
  });
}

export function assertValidParent(
  parent: WorkItem | null,
  childKind: WorkItemKind,
  projectId: string
): void {
  if (childKind === "requirement") {
    if (parent) throw new ApiError("requirement 必须是根节点", 400);
    return;
  }
  if (!parent) throw new ApiError("task 必须挂在 requirement 下", 400);
  if (!isValidWorkItemParent(childKind, parent, projectId)) {
    throw new ApiError("task 只能挂在同项目 requirement 下", 400);
  }
}
