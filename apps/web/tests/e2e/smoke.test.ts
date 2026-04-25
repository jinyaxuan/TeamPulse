/**
 * End-to-end smoke test for the happy paths:
 *   1. admin login → session cookie
 *   2. invite registration → one-use code creates a member account
 *   3. device register → pending → admin approve → poll returns token
 *   4. project resolve stores remote URL (idempotent)
 *   5. project membership is scoped by account and same remote joins automatically
 *   6. task start → appears in active_tasks → history
 *   7. branch-aware overlap warnings distinguish merge risk vs high risk
 *   8. project details expose branch filtering data + merge-risk queue inputs
 *   9. task end-session saves handoff summary → details/project/export
 *   10. SSE: new task event fans out to a separate subscriber
 *   11. cleanup closes remaining e2e tasks
 *   12. memory LWW: PUT creates v1 → PUT with correct If-Match bumps v2 →
 *      PUT with stale If-Match returns 409
 *   13. magic link: bearer issues link → consume returns session cookie
 *
 * Requires: `docker-compose up -d postgres` and `pnpm dev` running on :3000.
 * Uses a dedicated test admin (password is random per run).
 *
 * Run: `pnpm --filter @teampulse/web test:e2e`
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";

const BASE = process.env.TEAMPULSE_TEST_URL ?? "http://localhost:3000";

// ---------- helpers ----------

type Req = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  cookies?: string[];
  noBody?: boolean;
};

async function http(
  path: string,
  opts: Req = {}
): Promise<{ status: number; body: any; setCookies: string[]; headers: Headers }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookies?.length) headers["Cookie"] = opts.cookies.join("; ");
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  const setCookies: string[] = [];
  for (const [k, v] of res.headers.entries()) {
    if (k.toLowerCase() === "set-cookie") setCookies.push(v);
  }
  return { status: res.status, body, setCookies, headers: res.headers };
}

function extractSessionCookie(setCookies: string[]): string | null {
  for (const c of setCookies) {
    const m = c.match(/teampulse_session=([^;]+)/);
    if (m) return `teampulse_session=${m[1]}`;
  }
  return null;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function randomLower(n: number) {
  return randomBytes(n).toString("base64url").replace(/[^a-z]/gi, "").toLowerCase().slice(0, n);
}

function randomClaimCode() {
  const raw = randomBytes(3).toString("hex").toUpperCase();
  return `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
}

function taskPairKey(firstTaskId: string, secondTaskId: string): string {
  return [firstTaskId, secondTaskId].sort().join(":");
}

async function runCreateAdmin(env: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", ["create-admin"], {
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`create-admin exited ${code}: ${stderr}`));
    });
    child.on("error", reject);
  });
}

// ---------- tests ----------

test("e2e: full happy path", async (t) => {
  // Unique admin per run so tests are isolated.
  const adminName = `e2e_${randomLower(8)}`;
  const adminEmail = `${adminName}@example.com`;
  const adminPassword = randomBytes(16).toString("base64url");

  await t.test("bootstrap: create admin", async () => {
    await runCreateAdmin({
      TEAMPULSE_ADMIN_NAME: adminName,
      TEAMPULSE_ADMIN_EMAIL: adminEmail,
      TEAMPULSE_ADMIN_PASSWORD: adminPassword,
    });
  });

  let adminCookie!: string;

  await t.test("admin login", async () => {
    const res = await http("/api/v1/auth/login", {
      method: "POST",
      body: { email: adminEmail, password: adminPassword },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, adminName);
    const cookie = extractSessionCookie(res.setCookies);
    assert.ok(cookie, "expected session cookie");
    adminCookie = cookie!;
  });

  let invitedName!: string;
  let invitedCookie!: string;
  let invitedUserId!: string;

  await t.test("invite registration: admin creates one-use code", async () => {
    invitedName = `e2e_invited_${randomLower(6)}`;
    const invitedEmail = `${invitedName}@example.com`;
    const invitedPassword = randomBytes(16).toString("base64url");

    const invite = await http("/api/v1/admin/invite-codes", {
      method: "POST",
      cookies: [adminCookie],
      body: { label: `Invite ${invitedName}`, max_uses: 1 },
    });
    assert.equal(invite.status, 201);
    assert.match(invite.body.invite_code.code, /^TP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const registered = await http("/api/v1/auth/register", {
      method: "POST",
      body: {
        invite_code: invite.body.invite_code.code,
        name: invitedName,
        email: invitedEmail,
        password: invitedPassword,
      },
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.body.user.name, invitedName);
    invitedUserId = registered.body.user.id;
    const cookie = extractSessionCookie(registered.setCookies);
    assert.ok(cookie, "expected invited user session cookie");
    invitedCookie = cookie!;

    const reused = await http("/api/v1/auth/register", {
      method: "POST",
      body: {
        invite_code: invite.body.invite_code.code,
        name: `${invitedName}_again`,
        email: `again-${invitedEmail}`,
        password: invitedPassword,
      },
    });
    assert.equal(reused.status, 400);
    assert.equal(reused.body.error, "邀请码无效、已过期或已用完");
  });

  let deviceSecret!: string;
  let claimCode!: string;
  let deviceId!: string;

  await t.test("device: self claim binds to current account", async () => {
    const selfDeviceSecret = randomBytes(32).toString("base64url");
    const selfClaimCode = randomClaimCode();
    const registered = await http("/api/v1/devices/register", {
      method: "POST",
      body: {
        claim_code: selfClaimCode,
        device_secret: selfDeviceSecret,
        hostname: `e2e-self-${adminName}`,
        os: "linux",
        git_email: adminEmail,
      },
    });
    assert.equal(registered.status, 200);

    const claimed = await http("/api/v1/devices/claim-self", {
      method: "POST",
      cookies: [adminCookie],
      body: { claim_code: selfClaimCode },
    });
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.user.name, adminName);

    const polled = await http(`/api/v1/devices/claim-code/${selfClaimCode}`, {
      method: "POST",
      body: { device_secret: selfDeviceSecret },
    });
    assert.equal(polled.status, 200);
    assert.equal(polled.body.status, "active");
    assert.equal(polled.body.user.name, adminName);
    assert.ok(polled.body.token?.startsWith("tp_tok_"));

    const revoked = await http(`/api/v1/devices/${registered.body.device_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${polled.body.token}` },
    });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.status, "revoked");
  });

  await t.test("device: register pending", async () => {
    const res = await http("/api/v1/devices/register", {
      method: "POST",
      body: {
        hostname: `e2e-${adminName}`,
        os: "linux",
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "pending");
    assert.match(res.body.claim_code, /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/);
    assert.ok(res.body.device_secret?.length >= 32);
    claimCode = res.body.claim_code;
    deviceSecret = res.body.device_secret;
    deviceId = res.body.device_id;
  });

  const devUserName = `e2e_dev_${randomLower(6)}`;

  await t.test("device: admin approves + binds to new user", async () => {
    const res = await http(`/api/v1/admin/devices/${deviceId}/approve`, {
      method: "POST",
      cookies: [adminCookie],
      body: { user_name: devUserName },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, devUserName);
  });

  let devToken!: string;

  await t.test("device: plugin polls claim-code → active + token", async () => {
    const res = await http(`/api/v1/devices/claim-code/${claimCode}`, {
      method: "POST",
      body: { device_secret: deviceSecret },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "active");
    assert.ok(res.body.token?.startsWith("tp_tok_"));
    devToken = res.body.token;
  });

  const remoteUrl = `https://github.com/test/${adminName}-repo`;
  const remoteHash = sha256Hex(remoteUrl.toLowerCase());
  let projectId!: string;

  await t.test("project: resolve creates (first call) → same id on 2nd call", async () => {
    const first = await http("/api/v1/projects/resolve", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: { git_remote_hash: remoteHash, git_remote_url: remoteUrl },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.created, true);
    projectId = first.body.project_id;

    const second = await http("/api/v1/projects/resolve", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: { git_remote_hash: remoteHash, git_remote_url: remoteUrl },
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.created, false);
    assert.equal(second.body.project_id, projectId);

    const detail = await http(`/api/v1/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.project.git_remote_url, remoteUrl);
    assert.ok(
      detail.body.members.some((member: any) => member.user_name === devUserName),
      "project resolver should add the device user as a project member"
    );
    assert.equal(
      detail.body.members.find((member: any) => member.user_name === devUserName)?.role,
      "owner"
    );
    assert.equal(detail.body.can_manage_members, true);
  });

  await t.test("project: manual membership roles gate visibility and writes", async () => {
    const beforeJoin = await http(`/api/v1/projects/${projectId}`, {
      cookies: [invitedCookie],
    });
    assert.equal(beforeJoin.status, 404);

    const added = await http(`/api/v1/projects/${projectId}/members`, {
      method: "POST",
      cookies: [adminCookie],
      body: { user: invitedName, role: "viewer" },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.member.user_name, invitedName);
    assert.equal(added.body.member.role, "viewer");

    const afterInvite = await http(`/api/v1/projects/${projectId}`, {
      cookies: [invitedCookie],
    });
    assert.equal(afterInvite.status, 200);
    assert.equal(
      afterInvite.body.members.find((member: any) => member.user_name === invitedName)?.role,
      "viewer"
    );

    const sessionId = `e2e-sess-invited-${adminName}`;
    const readonlyStart = await http("/api/v1/tasks", {
      method: "POST",
      cookies: [invitedCookie],
      body: {
        git_remote_hash: remoteHash,
        session_id: `${sessionId}-readonly`,
        intent: "E2E: viewer cannot start a task",
      },
    });
    assert.equal(readonlyStart.status, 403);

    const promoted = await http(`/api/v1/projects/${projectId}/members/${invitedUserId}`, {
      method: "PATCH",
      cookies: [adminCookie],
      body: { role: "member" },
    });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.member.role, "member");

    const joined = await http("/api/v1/tasks", {
      method: "POST",
      cookies: [invitedCookie],
      body: {
        git_remote_hash: remoteHash,
        session_id: sessionId,
        intent: "E2E: invited user joins by same remote",
        branch: "e2e-invited-branch",
      },
    });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.project_id, projectId);

    const afterJoin = await http(`/api/v1/projects/${projectId}`, {
      cookies: [invitedCookie],
    });
    assert.equal(afterJoin.status, 200);
    const memberNames = afterJoin.body.members.map((member: any) => member.user_name).sort();
    assert.ok(memberNames.includes(devUserName));
    assert.ok(memberNames.includes(invitedName));

    const ended = await http("/api/v1/tasks/end-session", {
      method: "POST",
      cookies: [invitedCookie],
      body: {
        session_id: sessionId,
        outcome: "abandoned",
        summary: "E2E cleanup: closing invited membership fixture.",
      },
    });
    assert.equal(ended.status, 200);
    assert.equal(ended.body.ended_count, 1);

    const removed = await http(`/api/v1/projects/${projectId}/members/${invitedUserId}`, {
      method: "DELETE",
      cookies: [adminCookie],
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.removed, true);

    const afterRemove = await http(`/api/v1/projects/${projectId}`, {
      cookies: [invitedCookie],
    });
    assert.equal(afterRemove.status, 404);
  });

  let taskId!: string;
  let overlapTaskId!: string;
  let sameBranchTaskId!: string;
  let sseTaskId!: string;

  await t.test("task: start + appears in active", async () => {
    const res = await http("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {
        project_id: projectId,
        session_id: `e2e-sess-${adminName}`,
        intent: "E2E: write a failing test",
        branch: "e2e-branch",
        files_hint: ["src/lib/conflict-target.ts"],
      },
    });
    assert.equal(res.status, 200);
    taskId = res.body.task_id;

    const list = await http(`/api/v1/tasks/active?project=${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(list.status, 200);
    const ours = list.body.tasks.find((t: any) => t.id === taskId);
    assert.ok(ours, "task not found in active list");
    assert.equal(ours.intent, "E2E: write a failing test");
  });

  await t.test("task: different branch same file produces merge risk", async () => {
    const res = await http("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {
        project_id: projectId,
        session_id: `e2e-sess-overlap-${adminName}`,
        intent: "E2E: touch the same file from another task",
        branch: "e2e-overlap-branch",
        files_hint: ["./src/lib/conflict-target.ts"],
      },
    });
    assert.equal(res.status, 200);
    overlapTaskId = res.body.task_id;
    assert.equal(res.body.overlap_warnings.length, 1);
    assert.equal(res.body.overlap_warnings[0].task_id, taskId);
    assert.equal(res.body.overlap_warnings[0].severity, "medium");
    assert.deepEqual(res.body.overlap_warnings[0].reasons, ["merge_risk"]);
    assert.deepEqual(res.body.overlap_warnings[0].overlapping_files, [
      "src/lib/conflict-target.ts",
    ]);

    const project = await http(`/api/v1/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(project.status, 200);
    assert.equal(project.body.active.length, 2);
    assert.equal(
      project.body.active.find((task: any) => task.id === taskId)?.branch,
      "e2e-branch"
    );
    assert.equal(
      project.body.active.find((task: any) => task.id === overlapTaskId)?.branch,
      "e2e-overlap-branch"
    );
    assert.equal(project.body.active_overlaps.length, 1);
    assert.equal(project.body.active_overlaps[0].severity, "medium");
    assert.ok(
      project.body.active_overlaps.some((overlap: any) =>
        overlap.reasons.includes("merge_risk") &&
        overlap.overlapping_files.includes("src/lib/conflict-target.ts")
      ),
      "expected project details to include cross-branch merge risk"
    );
  });

  await t.test("task: same branch same file produces high warning", async () => {
    const res = await http("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {
        project_id: projectId,
        session_id: `e2e-sess-same-branch-${adminName}`,
        intent: "E2E: touch the same file on the same branch",
        branch: "e2e-branch",
        files_hint: ["src/lib/conflict-target.ts"],
      },
    });
    assert.equal(res.status, 200);
    sameBranchTaskId = res.body.task_id;

    const high = res.body.overlap_warnings.find((w: any) => w.task_id === taskId);
    assert.ok(high, "expected warning against original same-branch task");
    assert.equal(high.severity, "high");
    assert.deepEqual(high.reasons, ["files", "branch"]);
    assert.deepEqual(high.overlapping_files, ["src/lib/conflict-target.ts"]);

    const mergeRisk = res.body.overlap_warnings.find((w: any) => w.task_id === overlapTaskId);
    assert.ok(mergeRisk, "expected warning against different-branch task");
    assert.equal(mergeRisk.severity, "medium");
    assert.deepEqual(mergeRisk.reasons, ["merge_risk"]);
  });

  await t.test("project: branch data supports filtering + merge-risk queue", async () => {
    const project = await http(`/api/v1/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(project.status, 200);

    const activeOnMainBranch = project.body.active
      .filter((task: any) => task.branch === "e2e-branch")
      .map((task: any) => task.id)
      .sort();
    assert.deepEqual(activeOnMainBranch, [sameBranchTaskId, taskId].sort());

    const activeOnOverlapBranch = project.body.active
      .filter((task: any) => task.branch === "e2e-overlap-branch")
      .map((task: any) => task.id);
    assert.deepEqual(activeOnOverlapBranch, [overlapTaskId]);

    const mergeRiskOverlaps = project.body.active_overlaps.filter((overlap: any) =>
      overlap.reasons.includes("merge_risk")
    );
    const directOverlaps = project.body.active_overlaps.filter(
      (overlap: any) => !overlap.reasons.includes("merge_risk")
    );

    assert.deepEqual(
      directOverlaps.map((overlap: any) =>
        taskPairKey(overlap.first.task_id, overlap.second.task_id)
      ),
      [taskPairKey(taskId, sameBranchTaskId)]
    );
    assert.deepEqual(directOverlaps[0].reasons, ["files", "branch"]);
    assert.equal(directOverlaps[0].severity, "high");

    assert.deepEqual(
      mergeRiskOverlaps
        .map((overlap: any) => taskPairKey(overlap.first.task_id, overlap.second.task_id))
        .sort(),
      [taskPairKey(taskId, overlapTaskId), taskPairKey(overlapTaskId, sameBranchTaskId)].sort()
    );
    assert.ok(mergeRiskOverlaps.every((overlap: any) => overlap.severity === "medium"));
    assert.ok(
      mergeRiskOverlaps.every((overlap: any) =>
        overlap.overlapping_files.includes("src/lib/conflict-target.ts")
      )
    );
  });

  await t.test("task: history contains our task", async () => {
    const res = await http(
      `/api/v1/tasks/history?project=${projectId}&user=${devUserName}`,
      { headers: { Authorization: `Bearer ${devToken}` } }
    );
    assert.equal(res.status, 200);
    const ours = res.body.tasks.find((t: any) => t.id === taskId);
    assert.ok(ours);
  });

  await t.test("task: end-session saves handoff summary", async () => {
    const handoffToken = `handoff-${adminName}`;
    const summary = [
      `Changed: ${handoffToken} implemented the failing test path.`,
      "Verified: smoke test checked task detail, project detail, and CSV export.",
      "Risks: none for this e2e fixture.",
      "Next: keep the token visible for handoff search.",
    ].join("\n");

    const ended = await http("/api/v1/tasks/end-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {
        session_id: `e2e-sess-${adminName}`,
        outcome: "done",
        summary,
      },
    });
    assert.equal(ended.status, 200);
    assert.equal(ended.body.ended_count, 1);
    assert.equal(ended.body.summary_saved, true);

    const detail = await http(`/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.task.status, "done");
    assert.match(detail.body.task.summary, new RegExp(handoffToken));

    const project = await http(`/api/v1/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(project.status, 200);
    const recent = project.body.recent.find((t: any) => t.id === taskId);
    assert.ok(recent, "ended task not found in recent project history");
    assert.match(recent.summary, new RegExp(handoffToken));

    const exported = await http(
      `/api/v1/activity/export?showTestData=1&project=${projectId}&days=1`,
      { cookies: [adminCookie], noBody: true }
    );
    assert.equal(exported.status, 200);
    assert.match(exported.body, /交接摘要/);
    assert.match(exported.body, new RegExp(handoffToken));
  });

  await t.test("SSE: second task fires task.started to live subscriber", async () => {
    // Subscribe via fetch streaming.
    const abort = new AbortController();
    const streamRes = await fetch(`${BASE}/api/v1/stream?project=${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
      signal: abort.signal,
    });
    assert.equal(streamRes.status, 200);

    // Wait briefly for connection, then start a new task in a second call.
    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();

    const events: string[] = [];
    const deadline = Date.now() + 3000;
    const readPromise = (async () => {
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        events.push(decoder.decode(value));
        if (events.join("").includes("task.started")) return;
      }
    })();

    // Small yield so listener is registered.
    await new Promise((r) => setTimeout(r, 100));

    const started = await http("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {
        project_id: projectId,
        session_id: `e2e-sess-sse-${adminName}`,
        intent: "E2E: second task for SSE",
      },
    });
    assert.equal(started.status, 200);
    sseTaskId = started.body.task_id;

    await readPromise;
    abort.abort();

    const blob = events.join("");
    assert.match(blob, /event: task\.started/);
    assert.match(blob, /E2E: second task for SSE/);
  });

  await t.test("cleanup: closes remaining e2e tasks", async () => {
    for (const sessionId of [
      `e2e-sess-overlap-${adminName}`,
      `e2e-sess-same-branch-${adminName}`,
      `e2e-sess-sse-${adminName}`,
    ]) {
      const ended = await http("/api/v1/tasks/end-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${devToken}` },
        body: {
          session_id: sessionId,
          outcome: "abandoned",
          summary: "E2E cleanup: closing fixture task so smoke runs do not leave active test data.",
        },
      });
      assert.equal(ended.status, 200);
      assert.equal(ended.body.ended_count, 1);
      assert.equal(ended.body.summary_saved, true);
    }

    const active = await http(`/api/v1/tasks/active?project=${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(active.status, 200);
    assert.equal(active.body.tasks.length, 0);

    const project = await http(`/api/v1/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(project.status, 200);
    assert.deepEqual(project.body.active_overlaps, []);

    const closedIds = new Set([taskId, overlapTaskId, sameBranchTaskId, sseTaskId]);
    const recentlyClosed = project.body.recent.filter((t: any) => closedIds.has(t.id));
    assert.equal(recentlyClosed.length, 4);
    assert.ok(recentlyClosed.every((t: any) => t.status !== "active"));
  });

  await t.test("memory LWW: create v1, update v2, stale If-Match → 409", async () => {
    const put1 = await http(`/api/v1/memory/${projectId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${devToken}` },
      body: { content: "# v1\nfirst", device_name: "e2e-host" },
    });
    assert.equal(put1.status, 201);
    assert.equal(put1.body.version, 1);

    const put2 = await http(`/api/v1/memory/${projectId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${devToken}`, "If-Match": `"1"` },
      body: { content: "# v2\nsecond", device_name: "e2e-host" },
    });
    assert.equal(put2.status, 200);
    assert.equal(put2.body.version, 2);

    const stale = await http(`/api/v1/memory/${projectId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${devToken}`, "If-Match": `"1"` },
      body: { content: "# stale", device_name: "e2e-host2" },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.current_version, 2);
    assert.match(stale.body.content, /# v2/);
  });

  await t.test("magic link: bearer → url → consume → session cookie", async () => {
    const mk = await http("/api/v1/auth/magic", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {},
    });
    assert.equal(mk.status, 200);
    assert.match(mk.body.url, /\/magic\?token=/);

    const token = new URL(mk.body.url).searchParams.get("token")!;
    assert.ok(token);

    const consume = await http("/api/v1/auth/magic/consume", {
      method: "POST",
      body: { token },
    });
    assert.equal(consume.status, 200);
    assert.equal(consume.body.name, devUserName);

    const cookie = extractSessionCookie(consume.setCookies);
    assert.ok(cookie, "magic consume did not set cookie");

    // Cookie should let us hit /api/v1/users/me
    const me = await http("/api/v1/users/me", { cookies: [cookie!] });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.name, devUserName);

    // Second consume of the same token must fail.
    const consume2 = await http("/api/v1/auth/magic/consume", {
      method: "POST",
      body: { token },
    });
    assert.equal(consume2.status, 401);
  });

  await t.test("user can revoke own device", async () => {
    const del = await http(`/api/v1/devices/${deviceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(del.status, 200);
    assert.equal(del.body.status, "revoked");

    // Token should no longer be accepted.
    const after = await http("/api/v1/tasks/active", {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(after.status, 401);
  });
});
