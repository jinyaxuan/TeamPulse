#!/usr/bin/env node
/**
 * Small CLI for wiring a Codex environment into TeamPulse.
 */
import { createHash } from "node:crypto";
import { TeamPulseApiClient } from "../../plugin/mcp-server/api-client.js";
import { withCoordinationAdvice } from "../../plugin/mcp-server/coordination.js";
import {
  paths,
  pollClaimCode,
  readCredentials,
  registerDevice,
} from "../../plugin/mcp-server/auth.js";
import { resolveProject } from "../../plugin/mcp-server/project-resolve.js";

const args = process.argv.slice(2);
const command = args[0] || "help";

async function main() {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    case "status":
      await status();
      break;

    case "register":
      await register();
      break;

    case "poll":
      await poll();
      break;

    case "start":
      await startTask();
      break;

    case "heartbeat":
      await heartbeat();
      break;

    case "end":
      await endSession();
      break;

    case "active":
      await activeTasks();
      break;

    case "history":
      await history();
      break;

    case "web-login":
      await webLogin();
      break;

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  process.stdout.write(`TeamPulse Codex CLI

Usage:
  teampulse-codex register [--server-url http://localhost:3002]
  teampulse-codex poll [--server-url http://localhost:3002]
  teampulse-codex status
  teampulse-codex start --intent "Fix login bug" [--cwd /repo]
  teampulse-codex heartbeat [--file path]
  teampulse-codex end [--outcome done|abandoned]
  teampulse-codex active [--all]
  teampulse-codex history [--days 7] [--user alice]
  teampulse-codex web-login

Credentials are stored in ${paths.CREDENTIALS_PATH}.
`);
}

async function status() {
  const creds = await readCredentials();
  if (!creds) {
    writeJson({ configured: false, credentials_path: paths.CREDENTIALS_PATH });
    return;
  }
  writeJson({
    configured: true,
    server_url: creds.server_url,
    user_name: creds.user_name,
    device_id: creds.device_id,
    credentials_path: paths.CREDENTIALS_PATH,
  });
}

async function register() {
  const device = await registerDevice(option("server-url"));
  writeJson({
    status: "pending",
    server_url: device.server_url,
    device_id: device.device_id,
    claim_code: device.claim_code,
    next_step:
      "Open TeamPulse /settings/connect while logged into the target account, bind this claim code, then run teampulse-codex poll.",
  });
}

async function poll() {
  const device = await registerDevice(option("server-url"));
  const result = await pollClaimCode(device);
  writeJson(result);
}

async function startTask() {
  const client = await clientOrThrow();
  const cwd = currentCwd();
  const projectId = await resolveProject({ client, cwd });
  if (!projectId) throw new Error(`Could not resolve TeamPulse project from cwd: ${cwd}`);

  const intent = option("intent");
  if (!intent) throw new Error("--intent is required");

  const files = option("files");
  const res = await client.post("/api/v1/tasks", {
    project_id: projectId,
    session_id: sessionId(),
    client: "codex",
    intent: intent.slice(0, 500),
    files_hint: files ? files.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
  });
  if (!res.ok) throw new Error(res.error);
  writeJson(withCoordinationAdvice(res.data));
}

async function heartbeat() {
  const client = await clientOrThrow();
  const res = await client.post("/api/v1/tasks/heartbeat", {
    session_id: sessionId(),
    file_touched: option("file"),
  });
  if (!res.ok) throw new Error(res.error);
  writeJson(res.data);
}

async function endSession() {
  const client = await clientOrThrow();
  const res = await client.post("/api/v1/tasks/end-session", {
    session_id: sessionId(),
    outcome: option("outcome") || "done",
  });
  if (!res.ok) throw new Error(res.error);
  writeJson(res.data);
}

async function activeTasks() {
  const client = await clientOrThrow();
  let path = "/api/v1/tasks/active";
  if (!flag("all")) {
    const projectId = await resolveProject({ client, cwd: currentCwd() });
    if (projectId) path += `?project=${encodeURIComponent(projectId)}`;
  }
  const res = await client.get(path);
  if (!res.ok) throw new Error(res.error);
  writeJson(res.data);
}

async function history() {
  const client = await clientOrThrow();
  const params = new URLSearchParams({
    since: new Date(Date.now() - Number(option("days") || 7) * 86400_000).toISOString(),
  });
  if (option("user")) params.set("user", option("user"));
  const projectId = await resolveProject({ client, cwd: currentCwd() });
  if (projectId) params.set("project", projectId);
  const res = await client.get(`/api/v1/tasks/history?${params}`);
  if (!res.ok) throw new Error(res.error);
  writeJson(res.data);
}

async function webLogin() {
  const client = await clientOrThrow();
  const res = await client.post("/api/v1/auth/magic", {});
  if (!res.ok) throw new Error(res.error);
  writeJson(res.data);
}

async function clientOrThrow() {
  const creds = await readCredentials();
  if (!creds) {
    throw new Error(`TeamPulse is not configured. Run teampulse-codex register first.`);
  }
  return new TeamPulseApiClient(creds.server_url, creds.token);
}

function sessionId() {
  if (option("session-id")) return option("session-id");
  if (process.env.TEAMPULSE_SESSION_ID) return process.env.TEAMPULSE_SESSION_ID;
  if (process.env.CODEX_SESSION_ID) return process.env.CODEX_SESSION_ID;
  const seed = currentCwd();
  return `codex-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

function currentCwd() {
  return option("cwd") || process.env.TEAMPULSE_CWD || process.env.INIT_CWD || process.cwd();
}

function option(name) {
  const key = `--${name}`;
  const index = args.indexOf(key);
  if (index === -1) return undefined;
  return args[index + 1];
}

function flag(name) {
  return args.includes(`--${name}`);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message || err}\n`);
  process.exit(1);
});
