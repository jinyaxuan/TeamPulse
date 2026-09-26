"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { withBasePath } from "@/lib/base-path";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkItemTriage } from "./work-item-triage";
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

export function WorkItemDetail({
  projectId,
  itemId,
  members,
  agents,
  canEdit,
  canManage,
  canReview,
  currentUserId,
}: {
  projectId: string;
  itemId: string;
  members: WorkMember[];
  agents: WorkAgent[];
  canEdit: boolean;
  canManage: boolean;
  canReview: boolean;
  currentUserId: string;
}) {
  const [item, setItem] = useState<WorkItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItem = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    if (!quiet) setError(null);
    try {
      const response = await fetch(withBasePath(`/api/v1/work-items/${itemId}`), { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "加载工作项失败");
      let next = hydrateNames(normalizeWorkItem(payload.workItem ?? payload.work_item, projectId), members, agents);
      if (Array.isArray(payload.reviews)) next = { ...next, reviews: payload.reviews.map((review: unknown) => normalizeWorkItem({ reviews: [review] }).reviews[0]) };
      if (Array.isArray(payload.knowledge)) next = { ...next, knowledge: payload.knowledge.map((entry: unknown) => normalizeWorkItem({ knowledge: [entry] }).knowledge[0]) };
      setItem(next);
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "加载工作项失败");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [agents, itemId, members, projectId]);

  useEffect(() => { void loadItem(); }, [loadItem]);
  useEffect(() => {
    const stream = new EventSource(withBasePath(`/api/v1/stream?project=${encodeURIComponent(projectId)}`));
    const refresh = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { work_item_id?: string; workItemId?: string };
        if (data.work_item_id === itemId || data.workItemId === itemId) void loadItem(true);
      } catch { /* Ignore malformed events; regular navigation still reloads. */ }
    };
    stream.addEventListener("work_item.updated", refresh as EventListener);
    return () => {
      stream.removeEventListener("work_item.updated", refresh as EventListener);
      stream.close();
    };
  }, [itemId, loadItem, projectId]);

  if (loading) return <div className="rounded-[22px] border border-dashed border-black/10 px-4 py-10 text-center text-sm text-muted-foreground">正在加载工作项…</div>;
  if (error || !item) return <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-800">{error ?? "工作项不存在"}</div>;

  return (
    <div className="space-y-6">
      <WorkItemHero item={item} projectId={projectId} />
      <StageRail stage={item.stage} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <WorkItemOverview item={item} canEdit={canEdit && !["accepted", "cancelled"].includes(item.stage)} canManage={canManage} currentUserId={currentUserId} members={members} agents={agents} onSaved={() => void loadItem()} />
          <WorkItemTriage key={`${item.id}:${item.version}`} item={item} canEdit={canEdit} />
          {item.kind === "requirement" && <DecompositionPanel item={item} members={members} agents={agents} canCreate={canEdit && !["accepted", "cancelled"].includes(item.stage)} canManage={canManage} />}
          <ExecutionSessions item={item} canLink={canEdit && !["awaiting_acceptance", "accepted", "cancelled"].includes(item.stage)} onLinked={() => void loadItem()} />
          <EvidencePanel item={item} canSubmit={canEdit && !["accepted", "cancelled"].includes(item.stage)} onSubmitted={() => void loadItem()} />
          <ReviewPanel item={item} canReview={(item.reviewerId ? item.reviewerId === currentUserId : canReview) && item.assigneeId !== currentUserId} onReviewed={() => void loadItem()} />
        </div>
        <aside className="space-y-6">
          <AcceptanceSummary item={item} />
          <KnowledgePanel item={item} canEdit={canEdit} canManage={canManage} onSaved={() => void loadItem()} />
          <AuditPanel item={item} />
        </aside>
      </div>
    </div>
  );
}

function WorkItemHero({ item, projectId }: { item: WorkItem; projectId: string }) {
  return (
    <header className="tp-marvis-stage overflow-hidden rounded-[28px]">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/projects/${projectId}/work`} className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">项目工作流</Link>
              <span className="text-xs text-muted-foreground">/</span>
              <StatusBadge tone={stageTone(item.stage)} dot={item.stage === "in_progress"}>{stageLabels[item.stage]}</StatusBadge>
              <StatusBadge>{acceptancePolicyLabels[item.acceptancePolicy]}</StatusBadge>
            </div>
            <h1 className="mt-4 max-w-4xl text-2xl font-semibold sm:text-4xl">{item.title}</h1>
            {item.description && <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{item.description}</p>}
          </div>
          <div className="shrink-0 text-left text-xs text-muted-foreground lg:text-right"><div>最后更新</div><div className="mt-1 font-medium text-foreground">{timeAgo(item.updatedAt)}</div></div>
        </div>
        <div className="mt-6 grid gap-2 border-t border-black/[0.05] pt-5 text-xs text-muted-foreground sm:grid-cols-3">
          <Meta label="提出人" value={item.requesterName ?? "未知"} />
          <Meta label="负责人" value={item.assigneeName ?? "待分配"} />
          <Meta label="验收人" value={item.reviewerName ?? (item.acceptancePolicy === "agent" ? "Agent Skill" : "待指定")} />
        </div>
      </div>
    </header>
  );
}

function StageRail({ stage }: { stage: WorkStage }) {
  const current = stageOrder.indexOf(stage);
  return <div className="grid gap-2 overflow-x-auto sm:grid-cols-7">{stageOrder.map((entry, index) => <div key={entry} className={`min-w-[110px] rounded-[16px] border px-3 py-2.5 text-xs ${entry === stage ? "border-foreground bg-foreground text-background" : index < current ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-black/[0.06] bg-white/70 text-muted-foreground"}`}><div className="font-mono">0{index + 1}</div><div className="mt-1 font-medium">{stageLabels[entry]}</div></div>)}</div>;
}

function WorkItemOverview({ item, canEdit, canManage, currentUserId, members, agents, onSaved }: { item: WorkItem; canEdit: boolean; canManage: boolean; currentUserId: string; members: WorkMember[]; agents: WorkAgent[]; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [criteria, setCriteria] = useState(item.acceptanceCriteria.join("\n"));
  const [policy, setPolicy] = useState<AcceptancePolicy>(item.acceptancePolicy);
  const [stage, setStage] = useState<WorkStage>(item.stage);
  const [assignment, setAssignment] = useState(item.assigneeDeviceId ? `agent:${item.assigneeDeviceId}` : item.assigneeId ? `user:${item.assigneeId}` : "");
  const [reviewerId, setReviewerId] = useState(item.reviewerId ?? "");
  const [reviewerAgentId, setReviewerAgentId] = useState(item.reviewerDeviceId ?? "");
  const [priority, setPriority] = useState(item.priority ?? "normal");
  const [dueAt, setDueAt] = useState(item.dueAt ? localDateTime(item.dueAt) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const assignee = resolveAssignment(assignment, agents);

  useEffect(() => {
    setTitle(item.title); setDescription(item.description ?? ""); setCriteria(item.acceptanceCriteria.join("\n")); setPolicy(item.acceptancePolicy); setStage(item.stage); setAssignment(item.assigneeDeviceId ? `agent:${item.assigneeDeviceId}` : item.assigneeId ? `user:${item.assigneeId}` : ""); setReviewerId(item.reviewerId ?? ""); setReviewerAgentId(item.reviewerDeviceId ?? ""); setPriority(item.priority ?? "normal"); setDueAt(item.dueAt ? localDateTime(item.dueAt) : "");
  }, [item]);

  function save() {
    setError(null);
    startTransition(async () => {
      const currentAssignment = item.assigneeDeviceId ? `agent:${item.assigneeDeviceId}` : item.assigneeId ? `user:${item.assigneeId}` : "";
      const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: item.version, title: title.trim(), description: description.trim() || null, acceptance_criteria: criteria.split("\n").map((line) => line.trim()).filter(Boolean), ...(stage !== item.stage ? { stage } : {}), priority, due_at: dueAt ? new Date(dueAt).toISOString() : null, ...(canManage && policy !== item.acceptancePolicy ? { acceptance_policy: policy } : {}), ...(canManage && assignment !== currentAssignment ? { assignee_id: assignee.userId || null, assignee_device_id: assignee.deviceId } : {}), ...(canManage && reviewerId !== (item.reviewerId ?? "") ? { reviewer_user_id: reviewerId || null } : {}), ...(canManage && reviewerAgentId !== (item.reviewerDeviceId ?? "") ? { reviewer_device_id: reviewerAgentId || null } : {}) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error ?? "保存失败"); return; }
      onSaved(); setEditing(false);
    });
  }

  return <Panel title="需求与验收标准" description="这是协作的业务记录，执行 Agent 应该围绕这里的目标产出证据。" actions={canEdit ? <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface">{editing ? "取消编辑" : "编辑"}</button> : undefined}>
    {editing ? (
      <div className="space-y-3">
        <label className="block text-sm font-medium">标题<input value={title} onChange={(event) => setTitle(event.target.value)} className="tp-input mt-1 w-full" maxLength={240} /></label>
        <label className="block text-sm font-medium">背景与目标<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="tp-input mt-1 min-h-24 w-full resize-y rounded-[18px]" maxLength={10000} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">阶段<select value={stage} onChange={(event) => setStage(event.target.value as WorkStage)} className="tp-input mt-1 w-full">{Object.entries(stageLabels).filter(([value]) => value === item.stage || allowedNextStages(item.stage).includes(value as WorkStage)).filter(([value]) => value !== "cancelled" || canManage).filter(([value]) => value === item.stage || canManage || !item.assigneeId || item.assigneeId === currentUserId).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {canManage && <label className="text-sm font-medium">验收方式<select value={policy} onChange={(event) => setPolicy(event.target.value as AcceptancePolicy)} className="tp-input mt-1 w-full">{Object.entries(acceptancePolicyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        </div>
        {canManage && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">负责人<select value={assignment} onChange={(event) => setAssignment(event.target.value)} className="tp-input mt-1 w-full"><option value="">待分配</option><optgroup label="成员">{members.map((member) => <option key={member.id} value={`user:${member.id}`}>{member.displayName ?? member.name}</option>)}</optgroup><optgroup label="Agent 设备">{agents.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name} · {agent.type ?? "Agent"}{agent.capabilities.length ? ` · ${agent.capabilities.slice(0, 2).join(" / ")}` : ""}</option>)}</optgroup></select></label>
          {policy !== "agent" && <label className="text-sm font-medium">人工验收人<select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className="tp-input mt-1 w-full"><option value="">项目 Owner</option>{members.filter((member) => member.id !== assignee.userId).map((member) => <option key={member.id} value={member.id}>{member.displayName ?? member.name}</option>)}</select></label>}
          {policy !== "human" && <label className="text-sm font-medium">Agent 验收人<select value={reviewerAgentId} onChange={(event) => setReviewerAgentId(event.target.value)} className="tp-input mt-1 w-full"><option value="">任一独立 Agent</option>{agents.filter((agent) => agent.id !== assignee.deviceId && agent.userId !== assignee.userId).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.type ?? "Agent"}{agent.capabilities.length ? ` · ${agent.capabilities.slice(0, 2).join(" / ")}` : ""}</option>)}</select></label>}
        </div>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">优先级<select value={priority} onChange={(event) => setPriority(event.target.value)} className="tp-input mt-1 w-full"><option value="normal">普通</option><option value="low">低</option><option value="high">高</option><option value="urgent">紧急</option></select></label><label className="text-sm font-medium">截止时间<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="tp-input mt-1 w-full" /></label></div>
        <label className="block text-sm font-medium">验收标准<span className="mt-1 block text-xs font-normal text-muted-foreground">每行一条</span><textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} className="tp-input mt-1 min-h-24 w-full resize-y rounded-[18px]" /></label>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <button type="button" onClick={save} disabled={pending || !title.trim()} className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">{pending ? "保存中" : "保存修改"}</button>
      </div>
    ) : (
      <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Meta label="验收方式" value={acceptancePolicyLabels[item.acceptancePolicy]} /><Meta label="优先级" value={priorityLabel(item.priority)} /><Meta label="截止时间" value={formatWorkDate(item.dueAt)} /></div><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">验收标准</div>{item.acceptanceCriteria.length === 0 ? <EmptyPanel>还没有验收标准。先补标准，再让 Agent 执行，验收会更快。</EmptyPanel> : <ul className="mt-2 space-y-2">{item.acceptanceCriteria.map((criterion, index) => <li key={`${criterion}-${index}`} className="flex gap-2 rounded-[16px] bg-surface/70 px-3 py-2 text-sm"><span className="font-mono text-muted-foreground">{index + 1}.</span><span>{criterion}</span></li>)}</ul>}</div></div>
    )}
  </Panel>;
}

function DecompositionPanel({ item, members, agents, canCreate, canManage }: { item: WorkItem; members: WorkMember[]; agents: WorkAgent[]; canCreate: boolean; canManage: boolean }) {
  const [children, setChildren] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [assignment, setAssignment] = useState("");
  const [policy, setPolicy] = useState<AcceptancePolicy>("both");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const assignee = resolveAssignment(assignment, agents);

  const loadChildren = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const response = await fetch(withBasePath(`/api/v1/projects/${item.projectId}/work-items?parent_id=${encodeURIComponent(item.id)}`), { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setChildren((Array.isArray(payload.workItems ?? payload.work_items) ? payload.workItems ?? payload.work_items : []).map((row: unknown) => hydrateNames(normalizeWorkItem(row, item.projectId), members, agents)));
      setError(null);
    } else if (!quiet) {
      setError(payload.error ?? "加载拆解任务失败");
    }
    if (!quiet) setLoading(false);
  }, [agents, item.id, item.projectId, members]);

  useEffect(() => { void loadChildren(); }, [loadChildren]);
  useEffect(() => {
    const stream = new EventSource(withBasePath(`/api/v1/stream?project=${encodeURIComponent(item.projectId)}`));
    const refresh = () => { void loadChildren(true); };
    stream.addEventListener("work_item.updated", refresh);
    return () => { stream.removeEventListener("work_item.updated", refresh); stream.close(); };
  }, [item.projectId, loadChildren]);

  function createChild() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(withBasePath(`/api/v1/projects/${item.projectId}/work-items`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "task", parent_id: item.id, title: title.trim(), acceptance_criteria: criteria.split("\n").map((line) => line.trim()).filter(Boolean), assignee_id: canManage ? assignee.userId || undefined : undefined, assignee_device_id: canManage ? assignee.deviceId || undefined : undefined, acceptance_policy: canManage ? policy : undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error ?? "创建子任务失败"); return; }
      setTitle(""); setCriteria(""); setAssignment("");
      void loadChildren(true);
    });
  }

  return <Panel title={`任务拆解 · ${children.length}`} description="把需求拆成可独立分配、执行和验收的任务。每个子任务保留自己的证据和验收记录。">
    {loading ? <div className="text-sm text-muted-foreground">正在加载子任务…</div> : children.length === 0 ? <EmptyPanel>还没有拆解任务。</EmptyPanel> : <div className="space-y-2">{children.map((child) => <Link key={child.id} href={`/projects/${item.projectId}/work/${child.id}`} className="flex flex-col gap-2 rounded-[16px] border border-black/[0.06] bg-white/80 p-3 transition hover:bg-surface sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="line-clamp-2 text-sm font-medium">{child.title}</div><div className="mt-1 text-xs text-muted-foreground">{child.assigneeName ?? "待分配"} · {child.acceptanceCriteria.length} 条验收标准</div></div><StatusBadge tone={stageTone(child.stage)}>{stageLabels[child.stage]}</StatusBadge></Link>)}</div>}
    {canCreate && <div className="mt-4 rounded-[18px] bg-surface/70 p-3"><div className="text-xs font-semibold text-muted-foreground">新增子任务</div><input value={title} onChange={(event) => setTitle(event.target.value)} className="tp-input mt-2 w-full" placeholder="子任务标题" maxLength={240} />{canManage && <div className="mt-2 grid gap-2 sm:grid-cols-2"><select value={assignment} onChange={(event) => setAssignment(event.target.value)} className="tp-input w-full" aria-label="子任务负责人"><option value="">待分配</option><optgroup label="成员">{members.map((member) => <option key={member.id} value={`user:${member.id}`}>{member.displayName ?? member.name}</option>)}</optgroup><optgroup label="Agent 设备">{agents.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name} · {agent.type ?? "Agent"}{agent.capabilities.length ? ` · ${agent.capabilities.slice(0, 2).join(" / ")}` : ""}</option>)}</optgroup></select><select value={policy} onChange={(event) => setPolicy(event.target.value as AcceptancePolicy)} className="tp-input w-full" aria-label="子任务验收方式">{Object.entries(acceptancePolicyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}<textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} className="tp-input mt-2 min-h-20 w-full resize-y rounded-[18px]" placeholder="每行一条验收标准" />{error && <div className="mt-2 text-sm text-red-700">{error}</div>}<button type="button" onClick={createChild} disabled={pending || !title.trim() || !criteria.trim()} className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">{pending ? "创建中" : "创建子任务"}</button></div>}
  </Panel>;
}

function ExecutionSessions({ item, canLink, onLinked }: { item: WorkItem; canLink: boolean; onLinked: () => void }) {
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function linkSession() { setError(null); startTransition(async () => { const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}/sessions`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: item.version, task_id: taskId.trim() }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error ?? "关联执行会话失败"); return; } onLinked(); setTaskId(""); }); }
  return <Panel title={`执行会话 · ${item.sessions.length}`} description="每条会话保留 Agent 的意图、分支、文件触达和交接摘要。" bodyClassName="p-0">{item.sessions.length === 0 ? <div className="p-5"><EmptyPanel>尚未关联执行会话。Agent 可通过 Work Item API 提交或关联会话。</EmptyPanel></div> : <div className="divide-y divide-black/5">{item.sessions.map((session) => <div key={session.id} className="p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="font-medium">{session.intent}</div><div className="mt-1 text-xs text-muted-foreground">{session.userName ?? session.agentName ?? "未知 Agent"} · {session.branch ? <span className="font-mono">{session.branch}</span> : "未检测分支"}</div></div><StatusBadge tone={session.status === "active" ? "online" : session.status === "done" ? "slate" : "warning"}>{sessionStatusLabel(session.status)}</StatusBadge></div>{session.filesTouched.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{session.filesTouched.slice(0, 8).map((file) => <span key={file} className="rounded-full bg-surface px-2.5 py-1 font-mono text-xs text-muted-foreground">{file}</span>)}</div>}{session.summary && <div className="mt-3 rounded-[16px] bg-surface/70 px-3 py-2 text-sm leading-6">{session.summary}</div>}<div className="mt-3 text-xs text-muted-foreground">开始 {formatWorkDate(session.startedAt)} · 最近心跳 {timeAgo(session.heartbeatAt)}</div></div>)}</div>}{canLink && <div className="border-t border-black/5 bg-surface/60 p-4"><div className="text-xs font-semibold text-muted-foreground">关联已有 Agent 执行会话</div><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={taskId} onChange={(event) => setTaskId(event.target.value)} className="tp-input flex-1" placeholder="粘贴执行会话 task_id" /><button type="button" onClick={linkSession} disabled={pending || !taskId.trim()} className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">{pending ? "关联中" : "关联会话"}</button></div>{error && <div className="mt-2 text-sm text-red-700">{error}</div>}<div className="mt-2 text-xs text-muted-foreground">关联后，只有已完成的执行会话才能提交验收。</div></div>}</Panel>;
}

function EvidencePanel({ item, canSubmit, onSubmitted }: { item: WorkItem; canSubmit: boolean; onSubmitted: () => void }) {
  const [summary, setSummary] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit() { setError(null); startTransition(async () => { const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}/submit`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: item.version, summary: summary.trim(), evidence: evidence.trim() ? [{ kind: "note", label: "提交说明", content: evidence.trim() }] : [] }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error ?? "提交验收失败"); return; } onSubmitted(); setSummary(""); setEvidence(""); }); }
  return <Panel title={`证据 · ${item.evidence.length}`} description="验收只应该基于可追溯证据：测试结果、链接、截图说明或交接摘要。"><div className="space-y-3">{item.evidence.length === 0 ? <EmptyPanel>还没有提交证据。</EmptyPanel> : <div className="space-y-2">{item.evidence.map((entry) => <div key={entry.id} className="rounded-[18px] border border-black/[0.05] bg-white/70 p-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge>{entry.kind}</StatusBadge><span className="text-sm font-medium">{entry.label}</span><span className="text-xs text-muted-foreground">{formatWorkDate(entry.createdAt)}</span></div>{entry.content && <div className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.content}</div>}{entry.url && <a href={entry.url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-blue-700 underline">{entry.url}</a>}</div>)}</div>}{canSubmit && ["in_progress", "rejected"].includes(item.stage) && <div className="rounded-[18px] bg-surface/70 p-3"><div className="text-xs font-semibold text-muted-foreground">提交本轮工作</div><input value={summary} onChange={(event) => setSummary(event.target.value)} className="tp-input mt-2 w-full" placeholder="一句话说明完成了什么" maxLength={500} /><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} className="tp-input mt-2 min-h-20 w-full resize-y rounded-[18px]" placeholder="贴测试结果、PR 链接、截图说明或风险…" maxLength={3000} />{error && <div className="mt-2 text-sm text-red-700">{error}</div>}<button type="button" onClick={submit} disabled={pending || !summary.trim() || !item.sessions.some((session) => session.status === "done") || item.acceptanceCriteria.length === 0} className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">{pending ? "提交中" : "提交验收"}</button>{!item.sessions.some((session) => session.status === "done") && <div className="mt-2 text-xs text-muted-foreground">请先关联一条已完成的执行会话。</div>}{item.acceptanceCriteria.length === 0 && <div className="mt-2 text-xs text-muted-foreground">请先补充验收标准。</div>}</div>}</div></Panel>;
}

function ReviewPanel({ item, canReview, onReviewed }: { item: WorkItem; canReview: boolean; onReviewed: () => void }) {
  const [note, setNote] = useState("");
  const [checkedCriteria, setCheckedCriteria] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function review(decision: "approved" | "rejected" | "requested_changes") { setError(null); startTransition(async () => { const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}/reviews`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: item.version, decision, note: note.trim() || undefined, reviewer_type: "human", criterion_results: decision === "approved" ? Object.fromEntries(item.acceptanceCriteria.map((criterion) => [criterion, checkedCriteria.includes(criterion)])) : {} }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error ?? "提交评审失败"); return; } onReviewed(); setNote(""); setCheckedCriteria([]); }); }
  return <Panel title={`评审记录 · ${item.reviews.length}`} description={item.acceptancePolicy === "agent" ? "当前策略要求 Agent 评审；这里展示其结果，人工意见可以作为补充。" : item.acceptancePolicy === "both" ? "当前策略要求人和 Agent 都通过，任一方退回都会回到返工阶段。" : "当前策略由项目 Owner 或管理员负责最终验收。"}><div className="space-y-3">{item.reviews.length === 0 ? <EmptyPanel>暂无评审结果，当前阶段不会自动变成已验收。</EmptyPanel> : <div className="space-y-2">{item.reviews.map((review) => <div key={review.id} className="rounded-[18px] border border-black/[0.05] bg-white/70 p-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={review.decision === "approved" ? "online" : "risk"}>{review.decision === "approved" ? "通过" : review.decision === "requested_changes" ? "要求修改" : "退回"}</StatusBadge><span className="text-xs text-muted-foreground">{review.reviewerType === "agent" ? "Agent" : "人工"} · {review.reviewerName ?? "未知评审人"} · {formatWorkDate(review.createdAt)}</span></div>{review.note && <div className="mt-2 text-sm leading-6">{review.note}</div>}</div>)}</div>}{canReview && item.stage === "awaiting_acceptance" && <div className="rounded-[18px] bg-surface/70 p-3">{item.acceptanceCriteria.length > 0 && <div className="mb-3 space-y-2"><div className="text-xs font-semibold text-muted-foreground">逐条核对验收标准</div>{item.acceptanceCriteria.map((criterion) => <label key={criterion} className="flex items-start gap-2 rounded-[12px] bg-white/80 px-3 py-2 text-sm"><input type="checkbox" checked={checkedCriteria.includes(criterion)} onChange={(event) => setCheckedCriteria((current) => event.target.checked ? [...current, criterion] : current.filter((value) => value !== criterion))} className="mt-0.5 h-4 w-4" /><span>{criterion}</span></label>)}</div>}<textarea value={note} onChange={(event) => setNote(event.target.value)} className="tp-input min-h-20 w-full resize-y rounded-[18px]" placeholder="写下验收依据、风险或返工建议…" />{error && <div className="mt-2 text-sm text-red-700">{error}</div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={pending || checkedCriteria.length !== item.acceptanceCriteria.length} onClick={() => review("approved")} className="rounded-full bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">通过验收</button><button type="button" disabled={pending} onClick={() => review("requested_changes")} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 disabled:opacity-50">要求修改</button><button type="button" disabled={pending} onClick={() => review("rejected")} className="rounded-full border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-900 disabled:opacity-50">退回</button></div></div>}</div></Panel>;
}

function AcceptanceSummary({ item }: { item: WorkItem }) {
  const currentReviews = item.reviews.filter((review) => review.submissionAttempt === item.submissionAttempt);
  const approvedHuman = currentReviews.some((review) => review.reviewerType === "human" && review.decision === "approved");
  const approvedAgent = currentReviews.some((review) => review.reviewerType === "agent" && review.decision === "approved");
  const checks = item.acceptancePolicy === "human" ? [{ label: "人工验收", done: approvedHuman }] : item.acceptancePolicy === "agent" ? [{ label: "Agent 验收", done: approvedAgent }] : [{ label: "人工验收", done: approvedHuman }, { label: "Agent 验收", done: approvedAgent }];
  return <Panel title="验收状态" description="将完成条件和证据对齐，避免只看 Agent 的退出状态。"><div className="space-y-2">{checks.map((check) => <div key={check.label} className="flex items-center justify-between rounded-[16px] bg-surface/70 px-3 py-2.5 text-sm"><span>{check.label}</span><StatusBadge tone={check.done ? "online" : "warning"}>{check.done ? "已通过" : "待完成"}</StatusBadge></div>)}<div className="mt-3 rounded-[16px] border border-dashed border-black/10 px-3 py-3 text-xs leading-5 text-muted-foreground">{item.stage === "accepted" ? "工作项已经完成验收，可进入知识提炼。" : "执行会话完成只代表产出已交回，最终状态由上面的验收策略决定。"}</div></div></Panel>;
}

function KnowledgePanel({ item, canEdit, canManage, onSaved }: { item: WorkItem; canEdit: boolean; canManage: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function updateKnowledge(id: string, status: "published" | "archived") { setError(null); startTransition(async () => { const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}/knowledge/${id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error ?? "更新知识状态失败"); return; } onSaved(); }); }
  function save() { setError(null); startTransition(async () => { const response = await fetch(withBasePath(`/api/v1/work-items/${item.id}/knowledge`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), content: content.trim(), source: "work_item" }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error ?? "保存知识失败"); return; } onSaved(); setTitle(""); setContent(""); }); }
  return <Panel title={`知识沉淀 · ${item.knowledge.length}`} description="只保存可复用的决策、约束和验证方法，并保留来源工作项。">
    <div className="space-y-3">
      {item.knowledge.length === 0 ? <EmptyPanel>验收通过后，把一次性经验提炼成组织可复用的知识。</EmptyPanel> : item.knowledge.map((entry) => (
        <div key={entry.id} className="rounded-[18px] border border-black/[0.05] bg-white/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">{entry.title}</div>
            <StatusBadge tone={entry.status === "published" ? "online" : entry.status === "archived" ? "slate" : "warning"}>{entry.status === "published" ? "已发布" : entry.status === "archived" ? "已归档" : "草稿"}</StatusBadge>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{entry.content}</div>
          <div className="mt-2 text-xs text-muted-foreground">来源：{entry.source ?? "工作项"} · {formatWorkDate(entry.createdAt)}</div>
          {canManage && <div className="mt-3 flex flex-wrap gap-2">{entry.status !== "published" && <button type="button" disabled={pending} onClick={() => updateKnowledge(entry.id, "published")} className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50">发布</button>}{entry.status === "published" && <button type="button" disabled={pending} onClick={() => updateKnowledge(entry.id, "archived")} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium disabled:opacity-50">归档</button>}</div>}
        </div>
      ))}
      {error && <div className="text-sm text-red-700">{error}</div>}
      {canEdit && item.stage === "accepted" && <div className="rounded-[18px] bg-surface/70 p-3"><div className="text-xs font-semibold text-muted-foreground">提炼一条可复用结论</div><input value={title} onChange={(event) => setTitle(event.target.value)} className="tp-input mt-2 w-full" placeholder="例如：退款接口必须先校验幂等键" maxLength={200} /><textarea value={content} onChange={(event) => setContent(event.target.value)} className="tp-input mt-2 min-h-20 w-full resize-y rounded-[18px]" placeholder="结论、适用范围、验证方式…" maxLength={4000} /><button type="button" onClick={save} disabled={pending || !title.trim() || !content.trim()} className="mt-3 rounded-full bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50">{pending ? "保存中" : "保存知识草稿"}</button></div>}
    </div>
  </Panel>;
}

function AuditPanel({ item }: { item: WorkItem }) {
  return <Panel title="审计线索" description="保留谁在什么时候改变了阶段、标准、负责人或验收结果。"><div className="space-y-3">{item.audit.length === 0 ? <EmptyPanel>暂无审计记录。</EmptyPanel> : item.audit.map((entry) => <div key={entry.id} className="border-l-2 border-black/10 pl-3"><div className="text-sm font-medium">{entry.action}</div><div className="mt-1 text-xs text-muted-foreground">{entry.actorName ?? "系统"} · {formatWorkDate(entry.createdAt)}</div>{entry.detail && <div className="mt-1 text-xs leading-5 text-muted-foreground">{entry.detail}</div>}</div>)}</div></Panel>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><div>{label}</div><div className="mt-1 font-medium text-foreground">{value}</div></div>; }
function resolveAssignment(value: string, agents: WorkAgent[]): { userId: string; deviceId: string | null } { if (value.startsWith("user:")) return { userId: value.slice(5), deviceId: null }; if (value.startsWith("agent:")) { const device = agents.find((agent) => agent.id === value.slice(6)); if (device) return { userId: device.userId, deviceId: device.id }; } return { userId: "", deviceId: null }; }
function hydrateNames(item: WorkItem, members: WorkMember[], agents: WorkAgent[]): WorkItem { const assignee = members.find((candidate) => candidate.id === item.assigneeId); const agent = agents.find((candidate) => candidate.id === item.assigneeDeviceId); const reviewer = members.find((candidate) => candidate.id === item.reviewerId); return { ...item, assigneeName: agent ? `${agent.name} · ${assignee?.displayName ?? assignee?.name ?? "成员"}` : item.assigneeName ?? (assignee ? assignee.displayName ?? assignee.name : null), assigneeType: agent ? "agent" : item.assigneeType ?? (assignee ? "human" : null), reviewerName: item.reviewerName ?? (reviewer ? reviewer.displayName ?? reviewer.name : null) }; }
function priorityLabel(value?: string): string { if (value === "urgent") return "紧急"; if (value === "high") return "高"; if (value === "low") return "低"; return "普通"; }
function allowedNextStages(stage: WorkStage): WorkStage[] { const transitions: Record<WorkStage, WorkStage[]> = { intake: ["clarifying", "ready", "cancelled"], clarifying: ["ready", "intake", "cancelled"], ready: ["assigned", "clarifying", "cancelled"], assigned: ["in_progress", "ready", "cancelled"], in_progress: ["cancelled"], awaiting_acceptance: [], accepted: [], rejected: ["in_progress", "cancelled"], cancelled: [] }; return transitions[stage]; }
function localDateTime(value: string): string { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function sessionStatusLabel(status: string): string { if (status === "active") return "进行中"; if (status === "done") return "已完成"; if (status === "abandoned") return "已中断"; return status; }
function stageTone(stage: WorkStage): "online" | "agent" | "warning" | "risk" | "slate" { if (stage === "in_progress") return "online"; if (stage === "awaiting_acceptance") return "warning"; if (stage === "rejected" || stage === "cancelled") return "risk"; if (stage === "accepted") return "slate"; return "agent"; }
