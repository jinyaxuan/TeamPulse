"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { withBasePath } from "@/lib/base-path";
import { ActionLink } from "@/components/ui/action-link";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  acceptancePolicyLabels,
  formatWorkDate,
  normalizeWorkItem,
  stageLabels,
  stageOrder,
  timeAgo,
  type AcceptancePolicy,
  type WorkItem,
  type WorkAgent,
  type WorkMember,
  type WorkStage,
} from "./work-item-types";

type QueueFilter = "all" | WorkStage;

export function WorkQueue({
  projectId,
  members,
  agents,
  canCreate,
  canManage,
}: {
  projectId: string;
  members: WorkMember[];
  agents: WorkAgent[];
  canCreate: boolean;
  canManage: boolean;
}) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    if (!quiet) setError(null);
    try {
      const response = await fetch(withBasePath(`/api/v1/projects/${projectId}/work-items`), { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "加载工作项失败");
      setItems((Array.isArray(payload.workItems ?? payload.work_items) ? payload.workItems ?? payload.work_items : []).map((item: unknown) => hydrateAssignee(normalizeWorkItem(item, projectId), members, agents)));
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "加载工作项失败");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [agents, members, projectId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    const stream = new EventSource(withBasePath(`/api/v1/stream?project=${encodeURIComponent(projectId)}`));
    const refresh = () => { void loadItems(true); };
    stream.addEventListener("work_item.updated", refresh);
    return () => {
      stream.removeEventListener("work_item.updated", refresh);
      stream.close();
    };
  }, [loadItems, projectId]);

  const visibleItems = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.stage === filter)),
    [filter, items]
  );
  const counts = useMemo(() => {
    const result = new Map<string, number>([["all", items.length]]);
    for (const item of items) result.set(item.stage, (result.get(item.stage) ?? 0) + 1);
    return result;
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="tp-panel rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">项目工作流</span>
              <StatusBadge tone="agent">{items.length} 个工作项</StatusBadge>
            </div>
            <h2 className="mt-3 text-xl font-semibold">需求与交付</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">按阶段查看工作项，明确负责人、执行证据和验收结果。</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate((current) => !current)}
              className="shrink-0 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-sm transition hover:bg-black/80"
            >
              {showCreate ? "收起新需求" : "新建需求"}
            </button>
          )}
        </div>

        {showCreate && (
          <CreateWorkItemForm
            projectId={projectId}
            members={members}
            agents={agents}
            canManage={canManage}
            onCreated={(item) => {
              setItems((current) => [hydrateAssignee(item, members, agents), ...current]);
              setShowCreate(false);
            }}
          />
        )}
      </div>

      <Panel title="工作项队列" actions={<ActionLink href={`/projects/${projectId}`}>返回项目态势</ActionLink>}>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="工作项状态">
          <QueueFilterButton active={filter === "all"} label="全部" count={counts.get("all") ?? 0} onClick={() => setFilter("all")} />
          {stageOrder.map((stage) => (
            <QueueFilterButton
              key={stage}
              active={filter === stage}
              label={stageLabels[stage]}
              count={counts.get(stage) ?? 0}
              onClick={() => setFilter(stage)}
            />
          ))}
        </div>

        {error && <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {loading ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-black/10 px-4 py-8 text-center text-sm text-muted-foreground">正在加载工作项…</div>
        ) : visibleItems.length === 0 ? (
          <div className="mt-4">
            <EmptyPanel action={canCreate ? <button type="button" onClick={() => setShowCreate(true)} className="font-medium text-foreground underline">创建第一个需求</button> : undefined}>
              {filter === "all" ? "这个项目还没有工作项。把一条真实业务需求放进来，就可以开始分配和验收。" : `当前没有处于「${stageLabels[filter]}」的工作项。`}
            </EmptyPanel>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {visibleItems.map((item) => <WorkItemRow key={item.id} item={item} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}

function QueueFilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "border-foreground bg-foreground text-background" : "border-black/10 bg-white text-muted-foreground hover:border-black/20 hover:text-foreground"}`}
    >
      {label}
      <span className={active ? "text-background/70" : "text-muted-foreground/70"}>{count}</span>
    </button>
  );
}

function WorkItemRow({ item }: { item: WorkItem }) {
  const assignee = item.assigneeName ?? "待分配";

  return (
    <Link href={`/projects/${item.projectId}/work/${item.id}`} className="tp-list-card block p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={stageTone(item.stage)} dot={item.stage === "in_progress"}>{stageLabels[item.stage]}</StatusBadge>
            <StatusBadge>{item.kind === "requirement" ? "需求" : "任务"}</StatusBadge>
            <StatusBadge>{acceptancePolicyLabels[item.acceptancePolicy]}</StatusBadge>
            {item.priority && item.priority !== "normal" && <StatusBadge tone={item.priority === "urgent" || item.priority === "high" ? "risk" : "warning"}>{priorityLabel(item.priority)}</StatusBadge>}
          </div>
          <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-6">{item.title}</h3>
          {item.description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>负责人：{assignee}</span>
            <span>{item.acceptanceCriteria.length} 条验收标准</span>
            <span>更新：{timeAgo(item.updatedAt)}</span>
            {item.dueAt && <span>截止：{formatWorkDate(item.dueAt)}</span>}
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">查看详情 →</span>
      </div>
    </Link>
  );
}

function hydrateAssignee(item: WorkItem, members: WorkMember[], agents: WorkAgent[]): WorkItem {
  if (!item.assigneeId) return item;
  const member = members.find((candidate) => candidate.id === item.assigneeId);
  const agent = agents.find((candidate) => candidate.id === item.assigneeDeviceId);
  return member ? { ...item, assigneeName: agent ? `${agent.name} · ${member.displayName ?? member.name}` : member.displayName ?? member.name, assigneeType: agent ? "agent" : "human" } : item;
}

function CreateWorkItemForm({ projectId, members, agents, canManage, onCreated }: { projectId: string; members: WorkMember[]; agents: WorkAgent[]; canManage: boolean; onCreated: (item: WorkItem) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [policy, setPolicy] = useState<AcceptancePolicy>("both");
  const [assignment, setAssignment] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewerAgentId, setReviewerAgentId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const assignee = resolveAssignment(assignment, agents);

  function submit() {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch(withBasePath(`/api/v1/projects/${projectId}/work-items`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          kind: "requirement",
          acceptance_policy: canManage ? policy : undefined,
          acceptance_criteria: criteria.split("\n").map((line) => line.trim()).filter(Boolean),
          assignee_id: canManage ? assignee.userId || undefined : undefined,
          assignee_device_id: canManage ? assignee.deviceId || undefined : undefined,
          reviewer_user_id: canManage && policy !== "agent" ? reviewerId || undefined : undefined,
          reviewer_device_id: canManage && policy !== "human" ? reviewerAgentId || undefined : undefined,
          priority,
          due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "创建工作项失败");
        return;
      }
      onCreated(normalizeWorkItem(payload.workItem ?? payload.work_item, projectId));
    });
  }

  return (
    <div className="mt-5 rounded-[20px] border border-black/[0.06] bg-surface/70 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <label className="text-sm font-medium">需求标题<input value={title} onChange={(event) => setTitle(event.target.value)} className="tp-input mt-1 w-full" placeholder="例如：为结算页补充异常订单恢复流程" maxLength={200} /></label>
        {canManage && <label className="text-sm font-medium">验收方式<select value={policy} onChange={(event) => setPolicy(event.target.value as AcceptancePolicy)} className="tp-input mt-1 w-full">{Object.entries(acceptancePolicyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      </div>
      <label className="mt-3 block text-sm font-medium">背景与目标<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="tp-input mt-1 min-h-20 w-full resize-y rounded-[18px]" placeholder="说明为什么做、影响谁、完成后应该改变什么。" maxLength={4000} /></label>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <label className="text-sm font-medium">验收标准<span className="mt-1 block text-xs font-normal text-muted-foreground">每行一条，可直接转成评审清单</span><textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} className="tp-input mt-1 min-h-24 w-full resize-y rounded-[18px]" placeholder="页面能展示…\nAPI 返回…\n验证方式…" /></label>
        {canManage && <label className="text-sm font-medium">负责人<select value={assignment} onChange={(event) => setAssignment(event.target.value)} className="tp-input mt-1 w-full"><option value="">暂不分配</option><optgroup label="成员">{members.map((member) => <option key={member.id} value={`user:${member.id}`}>{member.displayName ?? member.name}</option>)}</optgroup><optgroup label="Agent 设备">{agents.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name} · {agent.type ?? "Agent"}{agent.capabilities.length ? ` · ${agent.capabilities.slice(0, 2).join(" / ")}` : ""}</option>)}</optgroup></select></label>}
        {canManage && policy !== "agent" && <label className="text-sm font-medium">人工验收人<select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className="tp-input mt-1 w-full"><option value="">项目 Owner</option>{members.filter((member) => member.id !== assignee.userId).map((member) => <option key={member.id} value={member.id}>{member.displayName ?? member.name}</option>)}</select></label>}
        {canManage && policy !== "human" && <label className="text-sm font-medium">Agent 验收人<select value={reviewerAgentId} onChange={(event) => setReviewerAgentId(event.target.value)} className="tp-input mt-1 w-full"><option value="">任一独立 Agent</option>{agents.filter((agent) => agent.id !== assignee.deviceId && agent.userId !== assignee.userId).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.type ?? "Agent"}{agent.capabilities.length ? ` · ${agent.capabilities.slice(0, 2).join(" / ")}` : ""}</option>)}</select></label>}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">优先级<select value={priority} onChange={(event) => setPriority(event.target.value)} className="tp-input mt-1 w-full"><option value="normal">普通</option><option value="low">低</option><option value="high">高</option><option value="urgent">紧急</option></select></label>
        <label className="text-sm font-medium">截止时间<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="tp-input mt-1 w-full" /></label>
      </div>
      {error && <div className="mt-3 text-sm text-red-700">{error}</div>}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2"><span className="mr-auto text-xs text-muted-foreground">创建后可继续澄清、分配和补充标准。</span><button type="button" onClick={submit} disabled={pending || !title.trim()} className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">{pending ? "创建中" : "创建工作项"}</button></div>
    </div>
  );
}

function resolveAssignment(value: string, agents: WorkAgent[]): { userId: string; deviceId: string | null } {
  if (value.startsWith("user:")) return { userId: value.slice(5), deviceId: null };
  if (value.startsWith("agent:")) {
    const device = agents.find((agent) => agent.id === value.slice(6));
    if (device) return { userId: device.userId, deviceId: device.id };
  }
  return { userId: "", deviceId: null };
}

function stageTone(stage: WorkStage): "online" | "agent" | "warning" | "risk" | "slate" {
  if (stage === "in_progress") return "online";
  if (stage === "awaiting_acceptance") return "warning";
  if (stage === "rejected" || stage === "cancelled") return "risk";
  if (stage === "accepted") return "slate";
  return "agent";
}

function priorityLabel(priority: string): string {
  if (priority === "urgent") return "紧急";
  if (priority === "high") return "高优先级";
  if (priority === "low") return "低优先级";
  return priority;
}
