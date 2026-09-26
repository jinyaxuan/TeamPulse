export type WorkStage =
  | "intake"
  | "clarifying"
  | "ready"
  | "assigned"
  | "in_progress"
  | "awaiting_acceptance"
  | "accepted"
  | "rejected"
  | "cancelled";

export type AcceptancePolicy = "human" | "agent" | "both";

export type WorkMember = {
  id: string;
  name: string;
  displayName: string | null;
  role: string;
  agentName?: string | null;
};

export type WorkAgent = {
  id: string;
  userId: string;
  name: string;
  type: string | null;
  role: string | null;
  capabilities: string[];
};

export type WorkEvidence = {
  id: string;
  kind: string;
  label: string;
  url?: string | null;
  content?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

export type WorkReview = {
  id: string;
  submissionAttempt: number;
  reviewerType: "human" | "agent";
  reviewerName?: string | null;
  decision: "approved" | "rejected" | "requested_changes";
  note?: string | null;
  createdAt: string;
};

export type WorkKnowledge = {
  id: string;
  title: string;
  content: string;
  status: "draft" | "published" | "archived";
  source?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

export type WorkSession = {
  id: string;
  taskId?: string | null;
  userId?: string | null;
  userName?: string | null;
  agentName?: string | null;
  intent: string;
  status: string;
  branch?: string | null;
  filesTouched: string[];
  summary?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  heartbeatAt?: string | null;
};

export type WorkTriage = {
  model: string;
  priority: { choice: "low" | "normal" | "high" | "urgent"; confidence: number };
  needsClarification: { noul: number };
  agentFit: { score: number; confidence: number };
  deliveryRisk: { score: number; confidence: number };
};

export type WorkTriageRecord = {
  eventId: string;
  inputVersion: number;
  createdAt: string;
  actorName: string | null;
  triage: WorkTriage;
  adoptedAction?: "priority" | "clarify";
};

export type WorkItem = {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  stage: WorkStage;
  version: number;
  submissionAttempt: number;
  kind: "requirement" | "task";
  parentId?: string | null;
  priority?: "low" | "normal" | "high" | "urgent" | string;
  acceptancePolicy: AcceptancePolicy;
  acceptanceCriteria: string[];
  requesterId?: string | null;
  requesterName?: string | null;
  assigneeId?: string | null;
  assigneeDeviceId?: string | null;
  assigneeName?: string | null;
  assigneeType?: "human" | "agent" | null;
  reviewerId?: string | null;
  reviewerDeviceId?: string | null;
  reviewerName?: string | null;
  dueAt?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  acceptedAt?: string | null;
  lastEvidenceAt?: string | null;
  sessions: WorkSession[];
  evidence: WorkEvidence[];
  reviews: WorkReview[];
  knowledge: WorkKnowledge[];
  latestTriage: WorkTriageRecord | null;
  audit: Array<{
    id: string;
    action: string;
    actorName?: string | null;
    detail?: string | null;
    payload?: unknown;
    createdAt: string;
  }>;
};

export type WorkItemListResponse = { workItems?: unknown[] };

export const stageLabels: Record<WorkStage, string> = {
  intake: "待澄清",
  clarifying: "澄清中",
  ready: "待分配",
  assigned: "已分配",
  in_progress: "执行中",
  awaiting_acceptance: "待验收",
  accepted: "已验收",
  rejected: "需返工",
  cancelled: "已取消",
};

export const acceptancePolicyLabels: Record<AcceptancePolicy, string> = {
  human: "人验收",
  agent: "Agent 验收",
  both: "人 + Agent",
};

export const stageOrder: WorkStage[] = [
  "intake",
  "clarifying",
  "ready",
  "assigned",
  "in_progress",
  "awaiting_acceptance",
  "accepted",
];

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeWebUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function dateValue(value: unknown): string {
  return stringValue(value, new Date().toISOString());
}

function normalizeStage(value: unknown): WorkStage {
  const stage = stringValue(value);
  if (stage === "draft") return "intake";
  if (stage === "submitted") return "awaiting_acceptance";
  if (stage === "rework") return "rejected";
  return stage in stageLabels ? (stage as WorkStage) : "intake";
}

function normalizePolicy(value: unknown): AcceptancePolicy {
  const policy = stringValue(value);
  return policy === "agent" || policy === "both" ? policy : "human";
}

function normalizeLatestTriage(value: unknown): WorkTriageRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, any>;
  const triage = record.triage;
  if (!triage || typeof triage !== "object" ||
    !["low", "normal", "high", "urgent"].includes(triage.priority?.choice) ||
    typeof triage.model !== "string" ||
    typeof triage.priority?.confidence !== "number" ||
    typeof triage.needsClarification?.noul !== "number" ||
    typeof triage.agentFit?.score !== "number" ||
    typeof triage.agentFit?.confidence !== "number" ||
    typeof triage.deliveryRisk?.score !== "number" ||
    typeof triage.deliveryRisk?.confidence !== "number" ||
    typeof record.eventId !== "string" ||
    typeof record.inputVersion !== "number") return null;
  return {
    eventId: record.eventId,
    inputVersion: record.inputVersion,
    createdAt: dateValue(record.createdAt),
    actorName: nullableString(record.actorName),
    triage: triage as WorkTriage,
    adoptedAction: record.adoptedAction === "priority" || record.adoptedAction === "clarify" ? record.adoptedAction : undefined,
  };
}

export function normalizeWorkItem(raw: any, fallbackProjectId = ""): WorkItem {
  const sessions = arrayValue(raw.sessions ?? raw.executionSessions).map((session: any) => ({
    id: stringValue(session.id ?? session.taskId),
    taskId: nullableString(session.taskId ?? session.task_id),
    userId: nullableString(session.userId ?? session.user_id),
    userName: nullableString(session.userName ?? session.user_name ?? session.userDisplayName),
    agentName: nullableString(session.agentName ?? session.agent_name),
    intent: stringValue(session.intent, "未提供执行意图"),
    status: stringValue(session.status, "active"),
    branch: nullableString(session.branch),
    filesTouched: arrayValue(session.filesTouched ?? session.files_touched).filter((file): file is string => typeof file === "string"),
    summary: nullableString(session.summary),
    startedAt: nullableString(session.startedAt ?? session.started_at),
    endedAt: nullableString(session.endedAt ?? session.ended_at),
    heartbeatAt: nullableString(session.heartbeatAt ?? session.heartbeat_at),
  }));

  const evidence = arrayValue(raw.evidence).map((entry: any) => ({
    id: stringValue(entry.id),
    kind: stringValue(entry.kind, "note"),
    label: stringValue(entry.label ?? entry.title, "执行证据"),
    url: safeWebUrl(entry.url),
    content: nullableString(entry.content ?? entry.body),
    createdAt: dateValue(entry.createdAt ?? entry.created_at),
    createdBy: nullableString(entry.createdBy ?? entry.created_by),
  }));

  const reviews: WorkReview[] = arrayValue(raw.reviews).map((review: any) => ({
    id: stringValue(review.id),
    submissionAttempt: typeof review.submissionAttempt === "number" ? review.submissionAttempt : typeof review.submission_attempt === "number" ? review.submission_attempt : 0,
    reviewerType: (review.reviewerType === "agent" || review.reviewer_type === "agent" ? "agent" : "human") as "human" | "agent",
    reviewerName: nullableString(review.reviewerName ?? review.reviewer_name),
    decision: (review.decision === "rejected" || review.decision === "requested_changes" ? review.decision : "approved") as WorkReview["decision"],
    note: nullableString(review.note),
    createdAt: dateValue(review.createdAt ?? review.created_at),
  }));

  const knowledge = arrayValue(raw.knowledge).map((entry: any) => ({
    id: stringValue(entry.id),
    title: stringValue(entry.title, "未命名知识"),
    content: stringValue(entry.content),
    status: entry.status === "published" || entry.status === "archived" ? entry.status : "draft",
    source: nullableString(entry.source),
    createdAt: dateValue(entry.createdAt ?? entry.created_at),
    createdBy: nullableString(entry.createdBy ?? entry.created_by),
  }));

  return {
    id: stringValue(raw.id),
    projectId: stringValue(raw.projectId ?? raw.project_id, fallbackProjectId),
    title: stringValue(raw.title ?? raw.intent, "未命名工作项"),
    description: nullableString(raw.description),
    stage: normalizeStage(raw.stage ?? raw.status),
    version: typeof raw.version === "number" ? raw.version : 1,
    submissionAttempt: typeof raw.submissionAttempt === "number" ? raw.submissionAttempt : typeof raw.submission_attempt === "number" ? raw.submission_attempt : 0,
    kind: raw.kind === "requirement" ? "requirement" : "task",
    parentId: nullableString(raw.parentId ?? raw.parent_id),
    priority: stringValue(raw.priority, "normal"),
    acceptancePolicy: normalizePolicy(raw.acceptancePolicy ?? raw.acceptance_policy ?? raw.review_policy),
    acceptanceCriteria: arrayValue(raw.acceptanceCriteria ?? raw.acceptance_criteria).filter((criterion): criterion is string => typeof criterion === "string"),
    requesterId: nullableString(raw.requesterId ?? raw.requester_id),
    requesterName: nullableString(raw.requesterName ?? raw.requester_name),
    assigneeId: nullableString(raw.assigneeId ?? raw.assignee_id ?? raw.assignee_user_id),
    assigneeDeviceId: nullableString(raw.assigneeDeviceId ?? raw.assignee_device_id),
    assigneeName: nullableString(raw.assigneeName ?? raw.assignee_name),
    assigneeType: raw.assigneeType === "agent" || raw.assignee_type === "agent" || raw.assignee_device_id ? "agent" : raw.assigneeId || raw.assignee_id || raw.assignee_user_id ? "human" : null,
    reviewerId: nullableString(raw.reviewerId ?? raw.reviewer_id ?? raw.reviewer_user_id),
    reviewerDeviceId: nullableString(raw.reviewerDeviceId ?? raw.reviewer_device_id),
    reviewerName: nullableString(raw.reviewerName ?? raw.reviewer_name),
    dueAt: nullableString(raw.dueAt ?? raw.due_at),
    createdAt: dateValue(raw.createdAt ?? raw.created_at),
    updatedAt: dateValue(raw.updatedAt ?? raw.updated_at),
    submittedAt: nullableString(raw.submittedAt ?? raw.submitted_at),
    acceptedAt: nullableString(raw.acceptedAt ?? raw.accepted_at),
    lastEvidenceAt: nullableString(raw.lastEvidenceAt ?? raw.last_evidence_at),
    sessions,
    evidence,
    reviews,
    knowledge,
    latestTriage: normalizeLatestTriage(raw.latestTriage),
    audit: arrayValue(raw.audit ?? raw.auditLog).map((entry: any) => ({
      id: stringValue(entry.id),
      action: stringValue(entry.action, "更新"),
      actorName: nullableString(entry.actorName ?? entry.actor_name),
      detail: nullableString(entry.detail),
      payload: entry.payload,
      createdAt: dateValue(entry.createdAt ?? entry.created_at),
    })),
  };
}

export function formatWorkDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function timeAgo(value?: string | null): string {
  if (!value) return "暂无";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "暂无";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}
