/**
 * End-to-end smoke test for the happy paths:
 *   1. admin login → session cookie
 *   2. device register → pending → admin approve → poll returns token
 *   3. project resolve (idempotent)
 *   4. task start → appears in active_tasks → history
 *   5. SSE: new task event fans out to a separate subscriber
 *   6. memory LWW: PUT creates v1 → PUT with correct If-Match bumps v2 →
 *      PUT with stale If-Match returns 409
 *   7. magic link: bearer issues link → consume returns session cookie
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

  const deviceSecret = randomBytes(32).toString("base64url");
  const claimCode = randomClaimCode();
  let deviceId!: string;

  await t.test("device: register pending", async () => {
    const res = await http("/api/v1/devices/register", {
      method: "POST",
      body: {
        claim_code: claimCode,
        device_secret: deviceSecret,
        hostname: `e2e-${adminName}`,
        os: "linux",
        git_email: `${adminName}+dev@example.com`,
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "pending");
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
  });

  let taskId!: string;

  await t.test("task: start + appears in active", async () => {
    const res = await http("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {
        project_id: projectId,
        session_id: `e2e-sess-${adminName}`,
        intent: "E2E: write a failing test",
        branch: "e2e-branch",
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

  await t.test("task: history contains our task", async () => {
    const res = await http(
      `/api/v1/tasks/history?project=${projectId}&user=${devUserName}`,
      { headers: { Authorization: `Bearer ${devToken}` } }
    );
    assert.equal(res.status, 200);
    const ours = res.body.tasks.find((t: any) => t.id === taskId);
    assert.ok(ours);
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

    await http("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}` },
      body: {
        project_id: projectId,
        session_id: `e2e-sess-sse-${adminName}`,
        intent: "E2E: second task for SSE",
      },
    });

    await readPromise;
    abort.abort();

    const blob = events.join("");
    assert.match(blob, /event: task\.started/);
    assert.match(blob, /E2E: second task for SSE/);
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
