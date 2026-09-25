import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  calculateAcceptance,
  canTransition,
  isHttpEvidenceUrl,
  isValidWorkItemParent,
  statusAfterAssignment,
} from "../../src/lib/work-item-state";

test("evidence links accept only HTTP(S) URLs", () => {
  assert.equal(isHttpEvidenceUrl("https://example.com/proof"), true);
  assert.equal(isHttpEvidenceUrl("http://example.com/proof"), true);
  for (const value of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,proof", "mailto:abc@example.com", "/relative", "not a url"]) {
    assert.equal(isHttpEvidenceUrl(value), false, value);
  }
});

test("requirements are roots and tasks belong under requirements in the same project", () => {
  const requirement = { kind: "requirement", projectId: "project-a" };
  const task = { kind: "task", projectId: "project-a" };
  assert.equal(isValidWorkItemParent("requirement", null, "project-a"), true);
  assert.equal(isValidWorkItemParent("requirement", requirement, "project-a"), false);
  assert.equal(isValidWorkItemParent("requirement", task, "project-a"), false);
  assert.equal(isValidWorkItemParent("task", null, "project-a"), false);
  assert.equal(isValidWorkItemParent("task", requirement, "project-a"), true);
  assert.equal(isValidWorkItemParent("task", requirement, "project-b"), false);
  assert.equal(isValidWorkItemParent("task", task, "project-a"), false);
});

test("work item stages require dedicated submit and review actions", () => {
  assert.equal(canTransition("intake", "clarifying"), true);
  assert.equal(canTransition("clarifying", "ready"), true);
  assert.equal(canTransition("ready", "assigned"), true);
  assert.equal(canTransition("assigned", "in_progress"), true);
  assert.equal(canTransition("in_progress", "awaiting_acceptance"), false);
  assert.equal(canTransition("awaiting_acceptance", "accepted"), false);
  assert.equal(canTransition("rejected", "in_progress"), true);
  assert.equal(canTransition("accepted", "in_progress"), false);
});

test("assignment does not rewind active or rejected work", () => {
  assert.equal(statusAfterAssignment("intake", undefined, true), "assigned");
  assert.equal(statusAfterAssignment("ready", undefined, true), "assigned");
  assert.equal(statusAfterAssignment("in_progress", undefined, true), undefined);
  assert.equal(statusAfterAssignment("rejected", undefined, true), undefined);
  assert.equal(statusAfterAssignment("in_progress", "cancelled", true), "cancelled");
});

test("human, agent, and both acceptance policies require their own approvals", () => {
  const human = { reviewerKind: "human", decision: "approved", submissionAttempt: 1 };
  const agent = { reviewerKind: "agent", decision: "approved", submissionAttempt: 1 };

  assert.equal(calculateAcceptance("human", 1, [human]).policySatisfied, true);
  assert.equal(calculateAcceptance("agent", 1, [human]).policySatisfied, false);
  assert.equal(calculateAcceptance("agent", 1, [agent]).policySatisfied, true);
  assert.equal(calculateAcceptance("both", 1, [human]).policySatisfied, false);
  assert.equal(calculateAcceptance("both", 1, [human, agent]).policySatisfied, true);
});

test("a resubmission cannot reuse prior attempt approvals", () => {
  const prior = [
    { reviewerKind: "human", decision: "approved", submissionAttempt: 1 },
    { reviewerKind: "agent", decision: "approved", submissionAttempt: 1 },
  ];
  assert.equal(calculateAcceptance("both", 1, prior).policySatisfied, true);
  assert.equal(calculateAcceptance("both", 2, prior).policySatisfied, false);
  assert.equal(
    calculateAcceptance("both", 2, [...prior, { reviewerKind: "agent", decision: "approved", submissionAttempt: 2 }]).policySatisfied,
    false
  );
});
