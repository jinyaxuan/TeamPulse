export const WORK_ITEM_KINDS = ["requirement", "task"] as const;
export const WORK_ITEM_STATUSES = [
  "intake",
  "clarifying",
  "ready",
  "assigned",
  "in_progress",
  "awaiting_acceptance",
  "accepted",
  "rejected",
  "cancelled",
] as const;
export const REVIEW_POLICIES = ["human", "agent", "both"] as const;

export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type ReviewPolicy = (typeof REVIEW_POLICIES)[number];

export function isHttpEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isValidWorkItemParent(
  childKind: WorkItemKind,
  parent: { kind: string; projectId: string } | null,
  projectId: string
): boolean {
  return childKind === "requirement"
    ? parent === null
    : parent?.kind === "requirement" && parent.projectId === projectId;
}

const allowedTransitions: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
  intake: ["clarifying", "ready", "cancelled"],
  clarifying: ["ready", "intake", "cancelled"],
  ready: ["assigned", "clarifying", "cancelled"],
  assigned: ["in_progress", "ready", "cancelled"],
  in_progress: ["cancelled"],
  awaiting_acceptance: [],
  accepted: [],
  rejected: ["in_progress", "cancelled"],
  cancelled: [],
};

export function canTransition(from: string, to: WorkItemStatus): boolean {
  return (allowedTransitions[from as WorkItemStatus] ?? []).includes(to);
}

export function statusAfterAssignment(
  current: string,
  requested: WorkItemStatus | undefined,
  assigned: boolean
): WorkItemStatus | undefined {
  if (requested) return requested;
  return assigned && (current === "intake" || current === "ready") ? "assigned" : undefined;
}

export function calculateAcceptance(
  policy: ReviewPolicy,
  currentAttempt: number,
  reviews: ReadonlyArray<{
    reviewerKind: string;
    decision: string;
    submissionAttempt: number;
  }>
): { humanApproved: boolean; agentApproved: boolean; policySatisfied: boolean } {
  const current = reviews.filter((review) => review.submissionAttempt === currentAttempt);
  const humanApproved = current.some((review) => review.reviewerKind === "human" && review.decision === "approved");
  const agentApproved = current.some((review) => review.reviewerKind === "agent" && review.decision === "approved");
  const policySatisfied = policy === "human"
    ? humanApproved
    : policy === "agent"
      ? agentApproved
      : humanApproved && agentApproved;
  return { humanApproved, agentApproved, policySatisfied };
}
