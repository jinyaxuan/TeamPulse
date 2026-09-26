import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parsePersistedJevTriage } from "../../src/lib/jev";

const validPayload = {
  model: "jev-test",
  input_version: 4,
  triage: {
    model: "jev-test",
    priority: { type: "choice", choice: "high", confidence: 0.8 },
    needsClarification: { type: "noul", noul: 0.4 },
    agentFit: { type: "score", score: 2, confidence: 0.9 },
    deliveryRisk: { type: "score", score: 1, confidence: 0.7 },
  },
};

test("persisted JEV triage exposes the decision and its source version", () => {
  assert.deepEqual(parsePersistedJevTriage(validPayload), {
    inputVersion: 4,
    triage: validPayload.triage,
  });
});

test("malformed historic JEV events cannot become adoptable suggestions", () => {
  assert.equal(parsePersistedJevTriage({ ...validPayload, input_version: "4" }), null);
  assert.equal(parsePersistedJevTriage({ ...validPayload, triage: { ...validPayload.triage, priority: { type: "choice", choice: "high", confidence: 1.5 } } }), null);
  assert.equal(parsePersistedJevTriage({ ...validPayload, triage: { ...validPayload.triage, deliveryRisk: null } }), null);
});
