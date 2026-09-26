import assert from "node:assert/strict";
import { test } from "node:test";
import { callWorkItemTool, workItemTools } from "../mcp-server/work-item-tools.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const workItemId = "22222222-2222-4222-8222-222222222222";
const knowledgeId = "33333333-3333-4333-8333-333333333333";

function recordingClient() {
  const calls = [];
  const client = Object.fromEntries(["get", "post", "patch"].map((method) => [
    method,
    async (path, body) => {
      calls.push({ method, path, body });
      return { ok: true, data: { id: workItemId, version: 2 } };
    },
  ]));
  return { client, calls };
}

test("publishes each durable work-item action as an MCP tool", () => {
  assert.deepEqual(workItemTools.map((tool) => tool.name), [
    "teampulse_search_knowledge",
    "teampulse_list_work_items", "teampulse_get_work_item", "teampulse_triage_work_item", "teampulse_create_work_item",
    "teampulse_update_work_item", "teampulse_link_work_session", "teampulse_submit_work_item",
    "teampulse_review_work_item", "teampulse_create_knowledge", "teampulse_update_knowledge",
  ]);
});

test("project knowledge search encodes filters and only sends a read request", async () => {
  const { client, calls } = recordingClient();
  await callWorkItemTool("teampulse_search_knowledge", { project_id: projectId, q: "支付 幂等", tag: "API/接口", limit: 12 }, client, () => "/repo");
  assert.deepEqual(calls, [{ method: "get", path: `/api/v1/projects/${projectId}/knowledge?q=%E6%94%AF%E4%BB%98+%E5%B9%82%E7%AD%89&tag=API%2F%E6%8E%A5%E5%8F%A3&limit=12`, body: undefined }]);
});

test("create uses the explicit project and does not send local cwd to the API", async () => {
  const { client, calls } = recordingClient();
  await callWorkItemTool("teampulse_create_work_item", {
    cwd: "/repo", project_id: projectId, kind: "requirement", title: "结算异常恢复",
    review_policy: "both", acceptance_criteria: ["用户能恢复订单"],
  }, client, () => "/repo");
  assert.deepEqual(calls, [{
    method: "post", path: `/api/v1/projects/${projectId}/work-items`,
    body: { kind: "requirement", title: "结算异常恢复", review_policy: "both", acceptance_criteria: ["用户能恢复订单"] },
  }]);
});

test("triage sends only the work-item version to the server-side JEV route", async () => {
  const { client, calls } = recordingClient();
  await callWorkItemTool("teampulse_triage_work_item", {
    work_item_id: workItemId, version: 7, confirm_external_transfer: true,
  }, client, () => "/repo");
  assert.deepEqual(calls, [{
    method: "post", path: `/api/v1/work-items/${workItemId}/triage`, body: { version: 7 },
  }]);
});

test("triage rejects missing or false external-transfer acknowledgement locally", async () => {
  const { client, calls } = recordingClient();
  for (const confirmation of [undefined, false]) {
    const result = await callWorkItemTool("teampulse_triage_work_item", {
      work_item_id: workItemId, version: 7, confirm_external_transfer: confirmation,
    }, client, () => "/repo");
    assert.equal(result.ok, false);
  }
  assert.equal(calls.length, 0);
});

test("submit, review and knowledge writes keep the work-item version and evidence", async () => {
  const { client, calls } = recordingClient();
  await callWorkItemTool("teampulse_submit_work_item", {
    work_item_id: workItemId, version: 4, summary: "已验证", evidence: [{ kind: "test", label: "类型检查", content: "passed" }],
  }, client, () => "/repo");
  await callWorkItemTool("teampulse_review_work_item", {
    work_item_id: workItemId, version: 5, decision: "approved", criterion_results: { "用户能恢复订单": true },
  }, client, () => "/repo");
  await callWorkItemTool("teampulse_update_knowledge", {
    work_item_id: workItemId, knowledge_id: knowledgeId, status: "published",
  }, client, () => "/repo");
  assert.deepEqual(calls.map(({ method, path }) => [method, path]), [
    ["post", `/api/v1/work-items/${workItemId}/submit`],
    ["post", `/api/v1/work-items/${workItemId}/reviews`],
    ["patch", `/api/v1/work-items/${workItemId}/knowledge/${knowledgeId}`],
  ]);
  assert.equal(calls[0].body.version, 4);
  assert.equal(calls[0].body.evidence[0].content, "passed");
  assert.deepEqual(calls[1].body.criterion_results, { "用户能恢复订单": true });
  assert.deepEqual(calls[2].body, { status: "published" });
});

test("rejects invalid work-item ids before making a request", async () => {
  const { client, calls } = recordingClient();
  const result = await callWorkItemTool("teampulse_get_work_item", { work_item_id: "../../tasks" }, client, () => "/repo");
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});
