"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { Panel } from "@/components/ui/panel";
import type { WorkItem } from "./work-item-types";

type Metric = { score: number; confidence: number };
type Triage = {
  model: string;
  priority: { choice: "low" | "normal" | "high" | "urgent"; confidence: number };
  needsClarification: { noul: number };
  agentFit: Metric;
  deliveryRisk: Metric;
};

const priorityLabels: Record<Triage["priority"]["choice"], string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function rubricPercentage(score: number): string {
  return percentage(score / 2);
}

function isTriage(value: unknown): value is Triage {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<Triage>;
  return typeof result.model === "string"
    && !!result.priority && result.priority.choice in priorityLabels
    && typeof result.priority.confidence === "number"
    && typeof result.needsClarification?.noul === "number"
    && typeof result.agentFit?.score === "number"
    && typeof result.agentFit.confidence === "number"
    && typeof result.deliveryRisk?.score === "number"
    && typeof result.deliveryRisk.confidence === "number";
}

export function WorkItemTriage({ item, canEdit }: { item: Pick<WorkItem, "id" | "version">; canEdit: boolean }) {
  const [triage, setTriage] = useState<Triage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  async function analyze() {
    setPending(true);
    setTriage(null);
    setError(null);
    setUnconfigured(false);
    try {
      const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}/triage`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: item.version }),
      });
      const payload: { error?: string; code?: string; triage?: unknown } = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.code === "JEV_NOT_CONFIGURED" || (response.status === 503 && /未配置|未设置/.test(payload.error ?? ""))) {
          setUnconfigured(true);
        } else {
          setError(payload.error ?? "JEV 分析失败，请稍后重试");
        }
        return;
      }
      if (!isTriage(payload.triage)) throw new Error("JEV 返回的分析结果格式异常");
      setTriage(payload.triage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "JEV 分析失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return <Panel
    title="JEV 分析"
    description="点击后会将工作项类型、标题、描述、验收标准、当前状态和优先级发送给 TypeSafe AI。分析仅供参考，不会自动修改工作项。"
    actions={canEdit ? <button type="button" onClick={() => void analyze()} disabled={pending} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50">{pending ? "分析中…" : triage ? "重新分析" : "开始分析"}</button> : undefined}
  >
    {pending && <p role="status" className="text-sm text-muted-foreground">正在分析工作项…</p>}
    {unconfigured && <p role="alert" className="text-sm text-amber-800">JEV 尚未配置，请联系管理员设置 TypeSafe API Key。</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!triage && !pending && !error && !unconfigured && <p className="text-sm text-muted-foreground">尚无本次页面会话的分析结果。</p>}
    {triage && <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Result label="建议优先级" value={priorityLabels[triage.priority.choice]} detail={`模型把握度 ${percentage(triage.priority.confidence)}`} explanation="建议处理顺序，需由项目成员决定是否采用。" />
        <Result label="需澄清概率" value={percentage(triage.needsClarification.noul)} explanation="越高表示需求信息越可能需要进一步澄清。" />
        <Result label="Agent 适配度" value={rubricPercentage(triage.agentFit.score)} detail={`模型把握度 ${percentage(triage.agentFit.confidence)}`} explanation="越高表示越适合交由 Agent 执行。" />
        <Result label="交付风险" value={rubricPercentage(triage.deliveryRisk.score)} detail={`模型把握度 ${percentage(triage.deliveryRisk.confidence)}`} explanation="越高表示按当前描述交付的风险越大。" />
      </div>
      <p className="text-xs text-muted-foreground">分析模型：{triage.model} · 本页展示本次结果，结构化结果已记入工作项审计记录。</p>
    </div>}
  </Panel>;
}

function Result({ label, value, detail, explanation }: { label: string; value: string; detail?: string; explanation: string }) {
  return <div className="border-t border-black/[0.06] pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="text-sm font-medium">{label}</span><span className="text-base font-semibold tabular-nums">{value}</span></div>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">{explanation}</p>
    {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
  </div>;
}
