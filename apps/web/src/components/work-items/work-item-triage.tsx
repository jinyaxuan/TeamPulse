"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { Panel } from "@/components/ui/panel";
import { formatWorkDate, type WorkItem, type WorkTriage } from "./work-item-types";

const priorityLabels: Record<WorkTriage["priority"]["choice"], string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function rubricScore(value: number): string {
  return `${Math.round(value * 100) / 100} / 2`;
}

async function readProjectPolicy(projectId: string, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(withBasePath(`/api/v1/projects/${projectId}/jev`), { cache: "no-store", signal });
  const payload: { enabled?: unknown; error?: string } = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "读取 JEV 项目设置失败");
  if (typeof payload.enabled !== "boolean") throw new Error("JEV 项目设置格式异常");
  return payload.enabled;
}

export function WorkItemTriage({ item, projectId, initialJevEnabled, canEdit, canManage, onChanged }: {
  item: WorkItem;
  projectId: string;
  initialJevEnabled: boolean;
  canEdit: boolean;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(initialJevEnabled);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyPending, setPolicyPending] = useState(false);
  const [pending, setPending] = useState<"analyze" | "priority" | "clarify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void readProjectPolicy(projectId, controller.signal)
      .then(setEnabled)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取 JEV 项目设置失败");
      })
      .finally(() => { if (!controller.signal.aborted) setPolicyLoading(false); });
    return () => controller.abort();
  }, [projectId]);

  async function updatePolicy() {
    setPolicyPending(true);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(withBasePath(`/api/v1/projects/${projectId}/jev`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const payload: { enabled?: unknown; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "更新 JEV 项目设置失败");
      if (typeof payload.enabled !== "boolean") throw new Error("JEV 项目设置格式异常");
      setEnabled(payload.enabled);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新 JEV 项目设置失败");
    } finally {
      setPolicyPending(false);
    }
  }

  async function submit(action: "analyze" | "priority" | "clarify") {
    const record = item.latestTriage;
    if (action !== "analyze" && (!record || record.inputVersion !== item.version)) return;
    setPending(action);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}/triage${action === "analyze" ? "" : "/adopt"}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "analyze"
          ? { version: item.version }
          : { version: item.version, triageEventId: record!.eventId, action }),
      });
      const payload: { error?: string; code?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        if (response.status === 403 && payload.code === "JEV_PROJECT_DISABLED") {
          setEnabled(false);
          try {
            setEnabled(await readProjectPolicy(projectId));
          } catch {
            throw new Error(`${payload.error ?? "该项目尚未启用 JEV"}。刷新项目设置失败，请重新加载页面`);
          }
        }
        throw new Error(payload.error ?? (action === "analyze" ? "JEV 分析失败" : "采纳建议失败"));
      }
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请求失败，请稍后重试");
    } finally {
      setPending(null);
    }
  }

  const record = item.latestTriage;
  const stale = !!record && record.inputVersion !== item.version;
  const canAdopt = enabled && canManage && !policyLoading && !policyPending && !!record && !stale && !record.adoptedAction;
  const canAdoptPriority = canAdopt && !["awaiting_acceptance", "accepted", "cancelled"].includes(item.stage) && item.priority !== record?.triage.priority.choice;

  return <Panel
    title="JEV 分析"
    description="工作项分析与决策记录"
    actions={enabled && canEdit ? <button type="button" onClick={() => void submit("analyze")} disabled={!!pending || policyLoading || policyPending} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50">{pending === "analyze" ? "分析中…" : record ? "重新分析" : "开始分析"}</button> : undefined}
  >
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
        <div>
          <div className="text-sm font-medium">允许本项目使用 JEV</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">启用后，分析时会向 TypeSafe AI 发送工作项类型、标题、描述、验收标准、当前阶段和优先级。</p>
        </div>
        {canManage ? <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input type="checkbox" role="switch" aria-label="允许本项目使用 JEV" checked={enabled} disabled={policyLoading || policyPending || !!pending} onChange={() => void updatePolicy()} className="h-4 w-4 accent-foreground" />
          {policyLoading ? "读取中…" : policyPending ? "保存中…" : enabled ? "已启用" : "未启用"}
        </label> : <span className="text-xs text-muted-foreground">{enabled ? "已启用" : "未启用"}</span>}
      </div>

      {!enabled && <p className="text-sm text-muted-foreground">本项目尚未启用 JEV。{canManage ? "启用后可分析工作项。" : "请联系项目 Owner 或管理员。"}</p>}
      {pending === "analyze" && <p role="status" className="text-sm text-muted-foreground">正在分析工作项…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700"><span>{error}</span>{conflict && <button type="button" onClick={() => { setError(null); setConflict(false); void onChanged(); }} className="font-medium underline">刷新工作项</button>}</div>}
      {enabled && !record && pending !== "analyze" && <p className="text-sm text-muted-foreground">暂无分析记录。</p>}

      {record && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{record.actorName ?? "项目成员"} · {formatWorkDate(record.createdAt)}</span>
          <span>工作项版本 {record.inputVersion}</span>
          <span>{stale ? "工作项已变更，建议已过期" : "基于当前版本"}</span>
          {record.adoptedAction && <span>{record.adoptedAction === "priority" ? "已采纳优先级" : "已转入澄清"}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Result label="建议优先级" value={priorityLabels[record.triage.priority.choice]} detail={`当前：${priorityLabels[item.priority as keyof typeof priorityLabels] ?? "普通"} · 把握度 ${percentage(record.triage.priority.confidence)}`} />
          <Result label="需澄清概率" value={percentage(record.triage.needsClarification.noul)} />
          <Result label="Agent 适配度" value={rubricScore(record.triage.agentFit.score)} detail={`把握度 ${percentage(record.triage.agentFit.confidence)}`} />
          <Result label="交付风险" value={rubricScore(record.triage.deliveryRisk.score)} detail={`把握度 ${percentage(record.triage.deliveryRisk.confidence)}`} />
        </div>
        {canAdopt && (canAdoptPriority || item.stage === "intake") && <div className="flex flex-wrap gap-2 border-t border-black/[0.06] pt-3">
          {canAdoptPriority && <button type="button" onClick={() => void submit("priority")} disabled={!!pending} className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50">{pending === "priority" ? "采纳中…" : `采纳优先级：${priorityLabels[record.triage.priority.choice]}`}</button>}
          {item.stage === "intake" && <button type="button" onClick={() => void submit("clarify")} disabled={!!pending} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50">{pending === "clarify" ? "转入中…" : "转入需求澄清"}</button>}
        </div>}
        <p className="text-xs text-muted-foreground">模型：{record.triage.model}。建议由项目负责人决定是否采纳。</p>
      </div>}
    </div>
  </Panel>;
}

function Result({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="border-t border-black/[0.06] pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="text-sm font-medium">{label}</span><span className="text-base font-semibold tabular-nums">{value}</span></div>
    {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
  </div>;
}
