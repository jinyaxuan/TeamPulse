import { and, count, desc, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db, projectMembers, users } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import {
  canManageProjectMembers,
  getVisibleProject,
  PROJECT_MEMBER_ROLES,
  type ProjectMemberRole,
} from "@/lib/project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const addMemberSchema = z.object({
  user: z.string().trim().min(1).max(256),
  role: z.enum(PROJECT_MEMBER_ROLES).default("member"),
});

export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, addMemberSchema);

  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);
  if (!(await canManageProjectMembers(project.id, ctx.user))) {
    throw new ApiError("只有项目 owner 或管理员可以管理成员", 403);
  }

  const identifier = body.user.toLowerCase();
  const [target] = await db
    .select()
    .from(users)
    .where(and(or(eq(users.name, identifier), eq(users.email, identifier)), isNull(users.revokedAt)))
    .limit(1);
  if (!target) throw new ApiError("没有找到这个用户", 404);

  const [existingMember] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, target.id)))
    .limit(1);
  if (existingMember?.role === "owner" && body.role !== "owner") {
    await assertAnotherOwnerExists(project.id, target.id);
  }

  const [member] = await db
    .insert(projectMembers)
    .values({
      projectId: project.id,
      userId: target.id,
      role: body.role,
      source: "manual",
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: {
        role: body.role,
        source: "manual",
        lastSeenAt: new Date(),
      },
    })
    .returning();

  return json({ member: toMemberResponse(member, target) }, { status: 201 });
});

export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);

  const members = await db
    .select({
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
      role: projectMembers.role,
      source: projectMembers.source,
      joined_at: projectMembers.createdAt,
      last_seen_at: projectMembers.lastSeenAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, project.id))
    .orderBy(desc(projectMembers.lastSeenAt));

  return json({ members });
});

function toMemberResponse(
  member: typeof projectMembers.$inferSelect,
  user: typeof users.$inferSelect
) {
  return {
    user_id: user.id,
    user_name: user.name,
    user_display_name: user.displayName,
    role: member.role as ProjectMemberRole,
    source: member.source,
    joined_at: member.createdAt,
    last_seen_at: member.lastSeenAt,
  };
}

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
