import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ActionLink } from "@/components/ui/action-link";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MonoPath, Workspace } from "@/components/ui/workspace";
import { getSessionUser } from "@/lib/auth";
import { listProjectsWithStats } from "@/lib/project-stats";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rows = await listProjectsWithStats({ user });
  const activeProjects = rows.filter((p) => p.active_count > 0).length;
  const recentlyTouched = rows.filter((p) => Boolean(p.last_activity)).length;

  return (
    <AppShell user={user} activeNav="projects">
      <Workspace>
        <PageHeader
          eyebrow="项目工作台"
          title="项目"
          description="按 Git 仓库聚合团队任务，优先识别哪里正在动、哪里需要协调、哪里只是历史记录。"
          actions={
            <>
              <ActionLink href="/activity">查看动态</ActionLink>
              <ActionLink href="/settings/connect" variant="primary">接入 Agent</ActionLink>
            </>
          }
          meta={
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <ProjectMeta label="活跃项目" value={`${activeProjects} 个`} detail="15 分钟内仍有任务心跳" />
              <ProjectMeta label="已有动态" value={`${recentlyTouched} 个`} detail={`共 ${rows.length} 个可见项目`} />
            </div>
          }
        />

        <Panel title="项目流" description="最近有动态的仓库会排在前面，进入项目后可以处理成员、消息、冲突和文件热区。">
          {rows.length === 0 ? (
            <EmptyPanel>还没有项目。安装 Claude Code 或 Codex 插件后，在 Git 仓库中启动会话即可自动注册。</EmptyPanel>
          ) : (
            <div className="grid gap-3">
              {rows.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="tp-list-card block p-4 sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_150px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{p.display_name ?? "未命名项目"}</h2>
                        {p.active_count > 0 ? (
                          <StatusBadge tone="online" dot>{p.active_count} 个进行中</StatusBadge>
                        ) : (
                          <StatusBadge>空闲</StatusBadge>
                        )}
                      </div>
                      <MonoPath className="mt-2 block truncate">{p.git_remote_hash.slice(0, 18)}...</MonoPath>
                    </div>
                    <div className="text-sm">
                      <div className="text-xs text-muted-foreground">最近动态</div>
                      <div className="mt-1 font-medium">
                        {p.last_activity ? formatRelativeTime(p.last_activity) : "暂无记录"}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-full border border-black/[0.06] bg-white/70 px-3 py-2 text-xs text-muted-foreground lg:justify-center">
                      <span>进入协调</span>
                      <span className="font-mono text-foreground">TP</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </Workspace>
    </AppShell>
  );
}

function ProjectMeta({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[20px] border border-black/[0.05] bg-white/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold text-foreground">{value}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
