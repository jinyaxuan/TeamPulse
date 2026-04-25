#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { homedir, hostname, platform } from "node:os";
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path";

const CONNECTOR_VERSION = "0.2.0";
const CONNECTOR_MARKER = "TEAMPULSE_CONNECTOR_SCRIPT";
const args = process.argv.slice(2);
const command = args[0] || "help";
const teampulseDir = join(homedir(), ".teampulse");
const devicePath = join(teampulseDir, "device.json");
const credentialsPath = join(teampulseDir, "credentials.json");

async function main() {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "register":
      await register();
      return;
    case "poll":
      await poll();
      return;
    case "status":
      await status();
      return;
    case "version":
      await versionInfo();
      return;
    case "update":
      await updateConnector();
      return;
    case "active":
      await activeTasks();
      return;
    case "start":
      await startTask();
      return;
    case "heartbeat":
      await heartbeat();
      return;
    case "end":
      await endSession();
      return;
    case "history":
      await history();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  process.stdout.write(`TeamPulse agent connector

Usage:
  node scripts/teampulse-connect.mjs register --server-url http://localhost:3002
  node scripts/teampulse-connect.mjs poll --server-url http://localhost:3002
  node scripts/teampulse-connect.mjs status
  node scripts/teampulse-connect.mjs version
  node scripts/teampulse-connect.mjs update [--server-url http://localhost:3002]
  node scripts/teampulse-connect.mjs active [--cwd /repo] [--all]
  node scripts/teampulse-connect.mjs start --intent "Fix login bug" [--cwd /repo]
  node scripts/teampulse-connect.mjs heartbeat [--file path]
  node scripts/teampulse-connect.mjs end [--outcome done|abandoned]
  node scripts/teampulse-connect.mjs history [--days 7] [--cwd /repo]

Credentials are stored in ${credentialsPath}.
`);
}

async function register() {
  const serverUrl = normalizedServerUrl();
  const existing = await readJson(devicePath);
  if (existing?.server_url === serverUrl && existing?.claim_code && existing?.device_secret) {
    writeJson({
      status: "pending",
      reused: true,
      server_url: existing.server_url,
      device_id: existing.device_id,
      claim_code: existing.claim_code,
      next_step: `Open ${serverUrl}/settings/connect and bind this claim code, then run poll.`,
    });
    return;
  }

  const body = await postJson(`${serverUrl}/api/v1/devices/register`, {
    hostname: hostname(),
    os: platform(),
    git_email: gitEmail(),
  });

  if (!body.claim_code || !body.device_secret || !body.device_id) {
    throw new Error("register response missing claim_code, device_secret, or device_id");
  }

  await ensureDir();
  await writeFile(
    devicePath,
    JSON.stringify(
      {
        server_url: serverUrl,
        device_id: body.device_id,
        claim_code: body.claim_code,
        device_secret: body.device_secret,
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  await chmod(devicePath, 0o600);

  writeJson({
    status: "pending",
    server_url: serverUrl,
    device_id: body.device_id,
    claim_code: body.claim_code,
    next_step: `Open ${serverUrl}/settings/connect and bind this claim code, then run poll.`,
  });
}

async function poll() {
  const serverUrl = normalizedServerUrl();
  const device = await readJson(devicePath);
  if (!device?.claim_code || !device?.device_secret) {
    throw new Error(`No pending device found at ${devicePath}. Run register first.`);
  }
  if (device.server_url && device.server_url !== serverUrl) {
    throw new Error(`Pending device was registered for ${device.server_url}; use that --server-url.`);
  }

  const body = await postJson(
    `${serverUrl}/api/v1/devices/claim-code/${encodeURIComponent(device.claim_code)}`,
    { device_secret: device.device_secret }
  );

  if (body.status === "active" && body.token) {
    await ensureDir();
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          server_url: body.server_url || serverUrl,
          token: body.token,
          user_name: body.user?.name,
          device_id: device.device_id,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
    await chmod(credentialsPath, 0o600);
    await unlink(devicePath).catch(() => {});
    writeJson({
      status: "configured",
      server_url: body.server_url || serverUrl,
      user_name: body.user?.name,
      device_id: device.device_id,
      credentials_path: credentialsPath,
    });
    return;
  }

  writeJson({
    status: body.status || "pending",
    claim_code: device.claim_code,
    next_step:
      body.status === "pending"
        ? `Open ${serverUrl}/settings/connect and bind this claim code.`
        : undefined,
  });
}

async function status() {
  const credentials = await readJson(credentialsPath);
  if (credentials?.server_url && credentials?.token) {
    writeJson({
      configured: true,
      connector_version: CONNECTOR_VERSION,
      server_url: credentials.server_url,
      user_name: credentials.user_name,
      device_id: credentials.device_id,
      credentials_path: credentialsPath,
    });
    return;
  }

  const pending = await readJson(devicePath);
  writeJson({
    configured: false,
    connector_version: CONNECTOR_VERSION,
    credentials_path: credentialsPath,
    pending_device: pending
      ? {
          server_url: pending.server_url,
          device_id: pending.device_id,
          claim_code: pending.claim_code,
        }
    : null,
  });
}

async function versionInfo() {
  writeJson({
    connector_version: CONNECTOR_VERSION,
    script_path: connectorPath(),
    credentials_path: credentialsPath,
  });
}

async function updateConnector() {
  const serverUrl = await updateServerUrl();
  const scriptUrl = `${serverUrl}/agent/teampulse-connect.mjs`;
  const next = await fetchText(scriptUrl);
  validateConnectorScript(next, scriptUrl);

  const currentPath = connectorPath();
  const current = await readFile(currentPath, "utf8").catch(() => "");
  const nextVersion = extractConnectorVersion(next) || "unknown";

  if (current === next) {
    writeJson({
      status: "current",
      connector_version: CONNECTOR_VERSION,
      latest_version: nextVersion,
      script_path: currentPath,
      script_url: scriptUrl,
    });
    return;
  }

  const tmpPath = `${currentPath}.tmp-${process.pid}`;
  await writeFile(tmpPath, next, { mode: 0o700 });
  await chmod(tmpPath, 0o700);
  await rename(tmpPath, currentPath);
  await chmod(currentPath, 0o700);

  writeJson({
    status: "updated",
    previous_version: CONNECTOR_VERSION,
    connector_version: nextVersion,
    script_path: currentPath,
    script_url: scriptUrl,
  });
}

async function activeTasks() {
  const { serverUrl, token } = await credentialsOrThrow();
  let path = "/api/v1/tasks/active";
  if (!flag("all")) {
    const projectId = await resolveProject({ serverUrl, token, cwd: currentCwd() });
    if (projectId) path += `?project=${encodeURIComponent(projectId)}`;
  }
  writeJson(await apiGet(serverUrl, token, path));
}

async function startTask() {
  const intent = option("intent");
  if (!intent) throw new Error("--intent is required");

  const { serverUrl, token } = await credentialsOrThrow();
  const cwd = currentCwd();
  const projectId = await resolveProject({ serverUrl, token, cwd });
  if (!projectId) throw new Error(`Could not resolve TeamPulse project from cwd: ${cwd}`);

  const result = await apiPost(serverUrl, token, "/api/v1/tasks", {
    project_id: projectId,
    session_id: sessionId(cwd),
    client: clientName(),
    intent: intent.slice(0, 500),
    branch: gitBranch(cwd),
    files_hint: splitCsv(option("files")),
  });
  writeJson(withCoordinationAdvice(result));
}

async function heartbeat() {
  const { serverUrl, token } = await credentialsOrThrow();
  writeJson(
    await apiPost(serverUrl, token, "/api/v1/tasks/heartbeat", {
      session_id: sessionId(currentCwd()),
      file_touched: option("file"),
    })
  );
}

async function endSession() {
  const { serverUrl, token } = await credentialsOrThrow();
  const outcome = option("outcome") || "done";
  if (!["done", "abandoned"].includes(outcome)) {
    throw new Error("--outcome must be done or abandoned");
  }

  writeJson(
    await apiPost(serverUrl, token, "/api/v1/tasks/end-session", {
      session_id: sessionId(currentCwd()),
      outcome,
    })
  );
}

async function history() {
  const { serverUrl, token } = await credentialsOrThrow();
  const params = new URLSearchParams({
    since: new Date(Date.now() - Number(option("days") || 7) * 86400_000).toISOString(),
  });
  if (option("user")) params.set("user", option("user"));
  const projectId = await resolveProject({ serverUrl, token, cwd: currentCwd() });
  if (projectId) params.set("project", projectId);
  writeJson(await apiGet(serverUrl, token, `/api/v1/tasks/history?${params}`));
}

function normalizedServerUrl() {
  return normalizeServerUrl(option("server-url") || process.env.TEAMPULSE_SERVER_URL || "http://localhost:3002");
}

function normalizeServerUrl(value) {
  return value.replace(/\/+$/, "");
}

async function updateServerUrl() {
  if (option("server-url") || process.env.TEAMPULSE_SERVER_URL) {
    return normalizedServerUrl();
  }
  const credentials = await readJson(credentialsPath);
  if (credentials?.server_url) return normalizeServerUrl(credentials.server_url);
  const pending = await readJson(devicePath);
  if (pending?.server_url) return normalizeServerUrl(pending.server_url);
  return normalizedServerUrl();
}

async function credentialsOrThrow() {
  const credentials = await readJson(credentialsPath);
  if (!credentials?.server_url || !credentials?.token) {
    throw new Error(`TeamPulse is not configured. Run register and poll first. Credentials path: ${credentialsPath}`);
  }
  return { serverUrl: credentials.server_url.replace(/\/+$/, ""), token: credentials.token };
}

async function resolveProject({ serverUrl, token, cwd }) {
  if (option("project-id")) return option("project-id");

  const configured = await resolveFromConfigFile(cwd);
  if (configured?.disabled) {
    throw new Error(`TeamPulse is disabled by .teampulse.json for cwd: ${cwd}`);
  }
  if (configured?.projectId) return configured.projectId;

  const remote = gitRemote(cwd);
  if (!remote) return null;
  const normalized = remote.toLowerCase().replace(/\.git$/, "");
  const gitRemoteHash = createHash("sha256").update(normalized).digest("hex");
  const result = await apiPost(serverUrl, token, "/api/v1/projects/resolve", {
    git_remote_hash: gitRemoteHash,
    git_remote_url: remote,
  });
  return result?.project_id || null;
}

async function resolveFromConfigFile(cwd) {
  let dir = resolvePath(cwd);
  while (true) {
    const candidate = join(dir, ".teampulse.json");
    const config = await readJson(candidate);
    if (config) {
      if (config.enabled === false) return { disabled: true };

      if (Array.isArray(config.overrides) && config.overrides.length > 0) {
        const rel = relative(dir, resolvePath(cwd));
        const parts = rel.split(sep);
        const matches = config.overrides
          .filter((o) => o.path && o.projectId)
          .filter((o) => {
            const overrideParts = o.path.split("/");
            for (let i = 0; i < overrideParts.length; i++) {
              if (parts[i] !== overrideParts[i]) return false;
            }
            return true;
          })
          .sort((a, b) => b.path.length - a.path.length);
        if (matches[0]) return { projectId: matches[0].projectId };
      }

      if (config.projectId) return { projectId: config.projectId };
      return null;
    }

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function apiGet(serverUrl, token, path) {
  return requestJson("GET", `${serverUrl}${path}`, undefined, token);
}

async function apiPost(serverUrl, token, path, body) {
  return requestJson("POST", `${serverUrl}${path}`, body, token);
}

function option(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

function flag(name) {
  return args.includes(`--${name}`);
}

function currentCwd() {
  return option("cwd") || process.env.TEAMPULSE_CWD || process.env.INIT_CWD || process.cwd();
}

function sessionId(cwd) {
  if (option("session-id")) return option("session-id");
  if (process.env.TEAMPULSE_SESSION_ID) return process.env.TEAMPULSE_SESSION_ID;
  if (process.env.CODEX_SESSION_ID) return process.env.CODEX_SESSION_ID;
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;
  return `agent-${createHash("sha256").update(cwd).digest("hex").slice(0, 16)}`;
}

function clientName() {
  const value = option("client") || process.env.TEAMPULSE_CLIENT || "codex";
  return value === "claude-code" ? "claude-code" : "codex";
}

function splitCsv(value) {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

async function ensureDir() {
  await mkdir(teampulseDir, { recursive: true, mode: 0o700 });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function postJson(url, body) {
  return requestJson("POST", url, body);
}

async function requestJson(method, url, body, token) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status} from ${url}`);
  }
  return data;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { Accept: "text/javascript, application/javascript, text/plain, */*" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
  }
  return text;
}

function validateConnectorScript(text, url) {
  if (!text.includes(CONNECTOR_MARKER) || !text.includes("teampulse-connect.mjs")) {
    throw new Error(`Downloaded file from ${url} does not look like a TeamPulse connector script.`);
  }
}

function extractConnectorVersion(text) {
  return text.match(/CONNECTOR_VERSION\s*=\s*"([^"]+)"/)?.[1];
}

function connectorPath() {
  return fileURLToPath(import.meta.url);
}

function gitRemote(cwd) {
  try {
    const out = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function gitBranch(cwd) {
  try {
    const out = execFileSync("git", ["-C", cwd, "branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function gitEmail() {
  try {
    const out = execFileSync("git", ["config", "--global", "user.email"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function withCoordinationAdvice(payload) {
  const warnings = Array.isArray(payload?.overlap_warnings) ? payload.overlap_warnings : [];
  const highRisk = warnings.filter((warning) => warning.severity === "high");

  if (highRisk.length > 0) {
    return {
      ...payload,
      coordination: {
        action: "pause_for_confirmation",
        severity: "high",
        summary:
          "Potential file overlap detected. Do not edit the overlapping files until the user confirms how to coordinate.",
        instructions: [
          "Tell the user which teammate/task is already active and which files overlap.",
          "Ask whether to wait, take over, narrow the scope, or continue anyway.",
          "Do not modify overlapping files before the user gives explicit direction.",
        ],
        warnings: highRisk,
      },
    };
  }

  if (warnings.length > 0) {
    return {
      ...payload,
      coordination: {
        action: "proceed_with_caution",
        severity: "medium",
        summary:
          "Related active work detected. Mention it once, keep the change scope narrow, and avoid expanding into the other task.",
        instructions: [
          "Tell the user there is related active work before making edits.",
          "Prefer a narrower implementation plan that avoids the related task area.",
          "Continue only if the planned work does not depend on the teammate's active task.",
        ],
        warnings,
      },
    };
  }

  return {
    ...payload,
    coordination: {
      action: "continue",
      severity: "clear",
      summary: "No overlap warnings were detected for the provided task hints.",
      instructions: ["Proceed normally and keep sending heartbeats for touched files."],
      warnings: [],
    },
  };
}

main().catch((err) => {
  process.stderr.write(`${err?.message || err}\n`);
  process.exit(1);
});
