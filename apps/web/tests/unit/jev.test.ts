import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isAllowedTriageOrigin, JevServiceError, triageWorkItem, type TriageInput } from "../../src/lib/jev";

const item: TriageInput = {
  kind: "task",
  title: "修复任务分配",
  description: "提交后任务没有分配给 Agent",
  acceptanceCriteria: ["负责人能看到分配结果"],
  priority: "normal",
  status: "intake",
};

const validResponse = {
  model: "jev-test",
  answers: {
    priority: { type: "choice", choice: "high", confidence: 0.8 },
    needs_clarification: { type: "noul", noul: 0.4 },
    agent_fit: { type: "score", score: 2, confidence: 0.9 },
    delivery_risk: { type: "score", score: 1, confidence: 0.7 },
  },
};

test("browser JEV requests require the configured application origin", () => {
  const appUrl = "https://team.example.com/teampulse";
  assert.equal(isAllowedTriageOrigin("https://team.example.com", appUrl), true);
  assert.equal(isAllowedTriageOrigin("https://other.example.com", appUrl), false);
  assert.equal(isAllowedTriageOrigin("http://team.example.com", appUrl), false);
  assert.equal(isAllowedTriageOrigin(null, appUrl), false);
});

test("JEV triage sends bounded work-item fields and typed questions", async () => {
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "jev-latest");
    assert.equal(body.state.title, item.title);
    assert.equal(body.state.description.length, 4000);
    assert.equal(body.state.description_truncated, true);
    assert.equal(body.state.acceptance_criteria.length, 10);
    assert.equal(body.state.acceptance_criteria_truncated, true);
    assert.deepEqual(Object.keys(body.questions).sort(), ["agent_fit", "delivery_risk", "needs_clarification", "priority"]);
    assert.deepEqual(Object.keys(body.questions.priority.criteria), ["low", "normal", "high", "urgent"]);
    assert.equal(body.questions.agent_fit.criteria.length, 3);
    assert.equal(body.questions.delivery_risk.criteria.length, 3);
    return Response.json(validResponse);
  };
  const result = await triageWorkItem({ ...item, description: "字".repeat(5000), acceptanceCriteria: Array(11).fill("标准") }, "test-key", request);
  assert.equal(result.priority.choice, "high");
  assert.equal(result.agentFit.score, 2);
  assert.equal(result.needsClarification.noul, 0.4);
});

test("JEV rejects malformed answers instead of recording a partial recommendation", async () => {
  const request: typeof fetch = async () => Response.json({ ...validResponse, answers: { ...validResponse.answers, agent_fit: { type: "score", score: 3, confidence: 0.9 } } });
  await assert.rejects(triageWorkItem(item, "test-key", request), (error: unknown) =>
    error instanceof JevServiceError && error.status === 502 && error.message === "JEV 返回了无效结果"
  );
});

test("JEV hides upstream authentication errors", async () => {
  const request: typeof fetch = async () => new Response("upstream secret diagnostic", { status: 401 });
  await assert.rejects(triageWorkItem(item, "test-key", request), (error: unknown) =>
    error instanceof JevServiceError && error.status === 503 && !error.message.includes("upstream")
  );
});

test("JEV network failures return a safe service error", async () => {
  const request: typeof fetch = async () => { throw new Error("request with credentials failed"); };
  await assert.rejects(triageWorkItem(item, "test-key", request), (error: unknown) =>
    error instanceof JevServiceError && error.status === 503 && !error.message.includes("credentials")
  );
});

test("local OpenAI-compatible triage parses the JSON answer", async () => {
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "http://127.0.0.1:8000/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "nvidia/nemotron");
    assert.equal(body.messages.length, 1);
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ answers: validResponse.answers }) } }],
    });
  };
  const result = await triageWorkItem(item, {
    endpoint: "http://127.0.0.1:8000/v1/chat/completions",
    apiKey: "",
    model: "nvidia/nemotron",
  }, request);
  assert.equal(result.model, "nvidia/nemotron");
  assert.equal(result.priority.choice, "high");
});
