import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { acceptanceReviews, db, workItemEvents, workItems } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import {
  calculateAcceptance,
  ensureVersion,
  publishWorkItemUpdate,
  requireProjectManager,
  requireProjectMember,
  requireVisibleWorkItem,
  toWorkItemResponse,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reviewSchema = z.object({
  version: z.number().int().positive(),
  decision: z.enum(["approved", "requested_changes", "rejected", "changes_requested"]),
  note: z.string().trim().max(5000).optional().nullable(),
  comment: z.string().trim().max(5000).optional().nullable(),
  reviewer_type: z.enum(["human", "agent"]).optional(),
  criterion_results: z.record(z.boolean()).default({}),
});

/** Record an immutable review and compute acceptance for the configured policy. */
export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const existing = await requireVisibleWorkItem(params.id, ctx.user);
  const body = await parseBody(request, reviewSchema);
  const reviewerKind = ctx.source === "bearer" ? "agent" : "human";

  if (reviewerKind === "agent") {
    await requireProjectMember(existing.projectId, ctx.user);
    if (!ctx.deviceId) throw new ApiError("Agent 验收必须来自已注册设备", 403);
  }

  const decision = body.decision === "changes_requested" ? "changes_requested" : body.decision;
  const review = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, existing.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("工作项不存在", 404);
    ensureVersion(body.version, current.version);
    if (current.status !== "awaiting_acceptance") {
      throw new ApiError("工作项已进入下一状态，请刷新后重试", 409);
    }
    if (reviewerKind === "human") {
      if (current.reviewerUserId && current.reviewerUserId !== ctx.user.id) {
        throw new ApiError("此工作项已指定其他人工验收人", 403);
      }
      if (current.reviewerUserId !== ctx.user.id) {
        await requireProjectManager(current.projectId, ctx.user);
      } else {
        await requireProjectMember(current.projectId, ctx.user);
      }
      if (current.assigneeUserId === ctx.user.id) {
        throw new ApiError("负责人不能对自己的工作项执行人工验收", 403);
      }
    } else {
      if (current.reviewerDeviceId && current.reviewerDeviceId !== ctx.deviceId) {
        throw new ApiError("此工作项已指定其他 Agent 验收", 403);
      }
      if (
        current.assigneeUserId === ctx.user.id ||
        current.assigneeDeviceId === ctx.deviceId
      ) {
        throw new ApiError("执行 Agent 不能验收自己的工作项", 403);
      }
    }
    if (decision === "approved" && current.acceptanceCriteria.some((criterion) => body.criterion_results[criterion] !== true)) {
      throw new ApiError("通过验收时必须逐条确认所有验收标准", 400);
    }

    const [createdReview] = await tx
      .insert(acceptanceReviews)
      .values({
        workItemId: current.id,
        reviewerUserId: ctx.user.id,
        reviewerDeviceId: reviewerKind === "agent" ? ctx.deviceId! : null,
        reviewerKind,
        submissionAttempt: current.submissionAttempt,
        decision,
        criterionResults: body.criterion_results,
        comment: body.comment ?? body.note ?? null,
      })
      .returning();

    const allReviews = await tx
      .select({ reviewerKind: acceptanceReviews.reviewerKind, decision: acceptanceReviews.decision, submissionAttempt: acceptanceReviews.submissionAttempt })
      .from(acceptanceReviews)
      .where(and(
        eq(acceptanceReviews.workItemId, current.id),
        eq(acceptanceReviews.submissionAttempt, current.submissionAttempt)
      ));
    const changesRequested = decision !== "approved";
    const { humanApproved, agentApproved, policySatisfied } = calculateAcceptance(
      current.reviewPolicy as "human" | "agent" | "both",
      current.submissionAttempt,
      allReviews
    );
    const finalStatus = changesRequested
      ? "rejected"
      : policySatisfied
        ? "accepted"
        : "awaiting_acceptance";

    const [updated] = await tx
      .update(workItems)
      .set({
        status: finalStatus,
        acceptedAt: finalStatus === "accepted" ? new Date() : null,
        updatedAt: new Date(),
        version: current.version + 1,
      })
      .where(and(eq(workItems.id, current.id), eq(workItems.version, current.version)))
      .returning();
    if (!updated) throw new ApiError("工作项已被其他人更新，请刷新后重试", 409);

    await tx.insert(workItemEvents).values({
      workItemId: current.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: finalStatus === "accepted" ? "accepted" : finalStatus === "rejected" ? "rejected" : "reviewed",
      fromStatus: current.status,
      toStatus: finalStatus,
      payload: {
        review_id: createdReview.id,
        reviewer_kind: reviewerKind,
        decision,
        policy: current.reviewPolicy,
        human_approved: humanApproved,
        agent_approved: agentApproved,
      },
    });

    return { item: updated, review: createdReview, humanApproved, agentApproved, policySatisfied };
  });

  const response = toWorkItemResponse(review.item);
  publishWorkItemUpdate({
    projectId: review.item.projectId,
    workItemId: review.item.id,
    actorUserId: ctx.user.id,
    status: review.item.status,
    version: review.item.version,
    eventType: review.item.status === "accepted" ? "accepted" : review.item.status === "rejected" ? "rejected" : "reviewed",
  });
  return json({
    workItem: response,
    work_item: response,
    review: {
      id: review.review.id,
      reviewer_type: review.review.reviewerKind,
      reviewerType: review.review.reviewerKind,
      decision: review.review.decision,
      note: review.review.comment,
      created_at: review.review.createdAt,
      createdAt: review.review.createdAt,
    },
    acceptance: {
      human_approved: review.humanApproved,
      agent_approved: review.agentApproved,
      policy_satisfied: review.policySatisfied,
      status: review.item.status,
    },
  });
});
