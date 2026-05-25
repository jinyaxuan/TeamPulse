import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ActionLink } from "@/components/ui/action-link";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MonoPath, Workspace } from "@/components/ui/workspace";
import { getSessionUser } from "@/lib/auth";
import { groupLabel, opsServices, type OpsService } from "@/lib/ops/catalog";
import { getWorkflowState, type OpsWorkflowState } from "@/lib/ops/gitea";
import { DeployButton } from "./deploy-button";

export const dynamic = "force-dynamic";

type ServiceRow = {
  service: OpsService;
  workflow: OpsWorkflowState;
};

export default async function OpsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const rows: ServiceRow[] = await Promise.all(
    opsServices.map(async (service) => ({
      service,
      workflow: await getWorkflowState(service),
    }))
  );

  const integratedCount = rows.filter((row) => row.service.workflow).length;
  const readyCount = rows.filter((row) => row.workflow.triggerable).length;
  const runningCount = rows.filter((row) => row.workflow.state === "running").length;
  const pendingCount = rows.filter((row) => row.workflow.state === "not-integrated").length;
  const grouped = groupRows(rows);

  return (
    <AppShell user={user} activeNav="ops">
      <Workspace>
        <PageHeader
          eyebrow="CI/CD 发布台"
          title="一次看完，一处触发"
          description="把 Gitea Actions、GitOps manifest、ArgoCD 应用和服务入口放到同一张操作面板里。"
          actions={
            <>
              <ActionLink href="/agent/ops-skill.md">Agent Skill</ActionLink>
              <ActionLink href="/activity">发布动态</ActionLink>
              <ActionLink href="/projects" variant="primary">项目协作</ActionLink>
            </>
          }
          meta={
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <OpsMeta label="服务目录" value={`${rows.length} 个`} detail="来自 TeamPulse ops catalog" />
              <OpsMeta label="已接 workflow" value={`${integratedCount} 个`} detail="可由发布台触发" />
              <OpsMeta label="可触发" value={`${readyCount} 个`} detail="不含执行中的任务" />
              <OpsMeta label="待补齐" value={`${pendingCount} 个`} detail="需要标准化 Gitea workflow" />
            </div>
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="已接入" value={integratedCount} detail="Gitea workflow 可查询或触发" tone="online" />
          <MetricCard label="执行中" value={runningCount} detail="避免重复触发同一发布" tone={runningCount > 0 ? "warning" : "default"} />
          <MetricCard label="待标准化" value={pendingCount} detail="优先接 new-api / skillhub" tone={pendingCount > 0 ? "warning" : "online"} />
          <MetricCard label="ArgoCD 应用" value={new Set(rows.map((row) => row.service.argocdApp)).size} detail="发布后仍由 ArgoCD 收敛" tone="agent" />
        </section>

        {grouped.map(([group, groupRows]) => (
          <Panel
            key={group}
            title={groupLabel(group)}
            description="发布按钮只触发业务仓库 workflow，真正落集群仍经过 k3s-manifests 和 ArgoCD。"
          >
            {groupRows.length === 0 ? (
              <EmptyPanel>暂无服务。</EmptyPanel>
            ) : (
              <div className="grid gap-3">
                {groupRows.map(({ service, workflow }) => (
                  <ServiceCard key={service.key} service={service} workflow={workflow} />
                ))}
              </div>
            )}
          </Panel>
        ))}
      </Workspace>
    </AppShell>
  );
}

function ServiceCard({ service, workflow }: ServiceRow) {
  return (
    <article className="tp-list-card p-4 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{service.name}</h2>
            <StatusBadge tone={toneForWorkflow(workflow)} dot>
              {workflow.label}
            </StatusBadge>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {service.tags.map((tag) => (
              <StatusBadge key={tag} tone="info">
                {tag}
              </StatusBadge>
            ))}
          </div>
        </div>

        <div className="grid gap-2 rounded-[18px] bg-white/70 px-4 py-3 text-xs text-muted-foreground ring-1 ring-black/[0.05]">
          <InfoLine label="仓库" value={`${service.owner}/${service.repo}`} />
          <InfoLine label="workflow" value={service.workflow ?? "未接入"} />
          <InfoLine label="部署" value={`${service.namespace}/${service.deployment}`} />
          <InfoLine label="manifest" value={service.manifestPath} mono />
          <div className="pt-1">
            <span className="text-foreground/60">最近状态</span>
            <div className="mt-1 leading-5">{workflow.detail}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 xl:flex-col xl:items-end">
          <DeployButton serviceKey={service.key} disabled={!workflow.triggerable} />
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            {workflow.runUrl && (
              <a className="rounded-full px-2.5 py-1.5 text-muted-foreground transition hover:bg-white hover:text-foreground" href={workflow.runUrl} target="_blank" rel="noreferrer">
                运行记录
              </a>
            )}
            {service.publicUrl && (
              <a className="rounded-full px-2.5 py-1.5 text-muted-foreground transition hover:bg-white hover:text-foreground" href={service.publicUrl} target="_blank" rel="noreferrer">
                服务入口
              </a>
            )}
            <Link
              className="rounded-full px-2.5 py-1.5 text-muted-foreground transition hover:bg-white hover:text-foreground"
              href={`/projects`}
            >
              协作
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
      <span className="text-foreground/60">{label}</span>
      {mono ? <MonoPath>{value}</MonoPath> : <span className="truncate">{value}</span>}
    </div>
  );
}

function OpsMeta({ label, value, detail }: { label: string; value: string; detail: string }) {
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

function toneForWorkflow(workflow: OpsWorkflowState): "slate" | "online" | "agent" | "warning" | "risk" | "info" {
  if (workflow.state === "success" || workflow.state === "ready") return "online";
  if (workflow.state === "running") return "agent";
  if (workflow.state === "failed") return "risk";
  if (workflow.state === "not-integrated" || workflow.state === "unconfigured") return "warning";
  return "slate";
}

function groupRows(rows: ServiceRow[]): Array<[OpsService["group"], ServiceRow[]]> {
  const order: OpsService["group"][] = ["core", "business", "infra"];
  return order
    .map((group) => [group, rows.filter((row) => row.service.group === group)] as [OpsService["group"], ServiceRow[]])
    .filter(([, groupRows]) => groupRows.length > 0);
}
