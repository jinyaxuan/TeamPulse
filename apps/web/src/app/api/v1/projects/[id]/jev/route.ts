import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, projectJevPolicyEvents, projects } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { env } from "@/lib/env";
import { isAllowedTriageOrigin } from "@/lib/jev";
import { canManageProjectMembers, getVisibleProject, isProjectMember } from "@/lib/project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const policySchema = z.object({ enabled: z.boolean() });

export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);
  if (!(await isProjectMember(project.id, ctx.user))) {
    throw new ApiError("只有项目成员可以查看 JEV 设置", 403);
  }
  return json({ enabled: project.jevEnabled });
});

export const PATCH = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  if (ctx.source !== "session") {
    throw new ApiError("JEV 设置只能由项目 owner 或管理员在网页中修改", 403);
  }
  if (!isAllowedTriageOrigin(request.headers.get("origin"), env.PUBLIC_APP_URL)) {
    throw new ApiError("请求来源无效", 403);
  }
  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);
  if (!(await canManageProjectMembers(project.id, ctx.user))) {
    throw new ApiError("只有项目 owner 或管理员可以修改 JEV 设置", 403);
  }
  const body = await parseBody(request, policySchema);
  if (body.enabled && !env.jevConfigured) {
    throw new ApiError("JEV 未配置，请联系管理员设置 JEV_BASE_URL 或 TYPESAFE_API_KEY", 503);
  }
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ enabled: projects.jevEnabled })
      .from(projects)
      .where(eq(projects.id, project.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("项目不存在", 404);
    if (current.enabled === body.enabled) return current;

    await tx.update(projects).set({ jevEnabled: body.enabled }).where(eq(projects.id, project.id));
    await tx.insert(projectJevPolicyEvents).values({
      projectId: project.id,
      actorUserId: ctx.user.id,
      source: "web",
      oldEnabled: current.enabled,
      newEnabled: body.enabled,
    });
    return { enabled: body.enabled };
  });
  return json(updated);
});
