import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, projects, tasks, users } from "@/db";
import { requireAuth } from "@/lib/api";
import { taskStatusLabel } from "@/lib/utils";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/activity/export?days=&user=&project=&status=
 * Returns a CSV dump of matching tasks, for standup / reporting.
 */
export async function GET(request: Request) {
  try {
    await requireAuth(request);
  } catch {
    return new Response("未登录或认证已失效", { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 7), 1), 90);
  const userName = url.searchParams.get("user");
  const projectId = url.searchParams.get("project");
  const statusParam = url.searchParams.get("status");

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const conditions: SQL[] = [gte(tasks.startedAt, since)];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (statusParam) {
    const wanted = statusParam.split(",").filter((s) => ["active", "done", "abandoned"].includes(s));
    if (wanted.length) conditions.push(inArray(tasks.status, wanted));
  }
  const userFilter: SQL | undefined = userName ? eq(users.name, userName) : undefined;

  const rows = await db
    .select({
      started_at: tasks.startedAt,
      ended_at: tasks.endedAt,
      user_name: users.name,
      project_name: projects.displayName,
      intent: tasks.intent,
      branch: tasks.branch,
      status: tasks.status,
      files_touched: tasks.filesTouched,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(userFilter ? and(...conditions, userFilter) : and(...conditions))
    .orderBy(desc(tasks.startedAt));

  const header = "开始时间,结束时间,用户,项目,状态,分支,任务意图,涉及文件\n";
  const lines = rows.map((r) =>
    [
      r.started_at.toISOString(),
      r.ended_at?.toISOString() ?? "",
      csvEscape(r.user_name),
      csvEscape(r.project_name ?? ""),
      taskStatusLabel(r.status),
      csvEscape(r.branch ?? ""),
      csvEscape(r.intent),
      csvEscape(r.files_touched.join("; ")),
    ].join(",")
  );
  const body = header + lines.join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="teampulse-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(v: string): string {
  if (v == null) return "";
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
