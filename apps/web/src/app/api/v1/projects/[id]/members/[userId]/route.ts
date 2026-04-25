import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, projectMembers } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import {
  canManageProjectMembers,
  getVisibleProject,
  PROJECT_MEMBER_ROLES,
} from "@/lib/project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchMemberSchema = z.object({
  role: z.enum(PROJECT_MEMBER_ROLES),
});

export const PATCH = handler<{ id: string; userId: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, patchMemberSchema);

  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);
  if (!(await canManageProjectMembers(project.id, ctx.user))) {
    throw new ApiError("只有项目 owner 或管理员可以管理成员", 403);
  }

  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, params.userId)))
    .limit(1);
  if (!existing) throw new ApiError("成员不存在", 404);

  if (existing.role === "owner" && body.role !== "owner") {
    await assertAnotherOwnerExists(project.id, params.userId);
  }

  const [updated] = await db
    .update(projectMembers)
    .set({
      role: body.role,
      source: existing.source === "manual" ? existing.source : "manual",
      lastSeenAt: new Date(),
    })
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, params.userId)))
    .returning();

  return json({ member: updated });
});

export const DELETE = handler<{ id: string; userId: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);
  if (!(await canManageProjectMembers(project.id, ctx.user))) {
    throw new ApiError("只有项目 owner 或管理员可以管理成员", 403);
  }

  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, params.userId)))
    .limit(1);
  if (!existing) throw new ApiError("成员不存在", 404);

  if (existing.role === "owner") {
    await assertAnotherOwnerExists(project.id, params.userId);
  }

  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, params.userId)));

  return json({ removed: true });
});

async function assertAnotherOwnerExists(projectId: string, excludedUserId: string): Promise<void> {
  const [ownerCount] = await db
    .select({ value: count() })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.role, "owner"),
        ne(projectMembers.userId, excludedUserId)
      )
    );

  if (Number(ownerCount.value) < 1) {
    throw new ApiError("项目至少需要保留一个 owner", 400);
  }
}
