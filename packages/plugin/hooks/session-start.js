#!/usr/bin/env node
/**
 * SessionStart hook. Runs once per Claude Code session.
 *
 * Flow:
 *   1. If credentials exist → fetch active tasks for this project, inject into
 *      additionalContext so Claude sees teammate activity.
 *   2. If no credentials → register this device + emit claim code guidance.
 *   3. Also kicks off memory pull (best-effort) in background.
 *
 * Total wall-clock budget: <2s. If backend is slow or unreachable, emit
 * a minimal context and exit 0 — never block Claude.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDisabled, readCredentials, registerDevice, pollClaimCode } from "../mcp-server/auth.js";
import { TeamPulseApiClient } from "../mcp-server/api-client.js";
import { pullMemory } from "../mcp-server/memory-sync.js";
import { resolveProject } from "../mcp-server/project-resolve.js";
import { drain as drainQueue } from "../mcp-server/queue.js";
import { readStdinSync } from "./_stdin.js";

async function main() {
  if (isDisabled()) {
    process.exit(0);
  }

  const input = readStdinSync();
  const cwd = input.cwd || process.cwd();

  const creds = await readCredentials();

  // Not configured — try to register + emit claim code.
  if (!creds) {
    try {
      const device = await registerDevice();
      emitContext(
        `[TeamPulse 待认领] This device is pending admin approval.\n` +
          `Claim code: ${device.claim_code}\n` +
          `Server: ${device.server_url}/admin/devices\n` +
          `Share this 6-char code with your admin to finish setup.`
      );
      // Also kick off a single poll to pick up an already-approved device.
      try {
        const result = await pollClaimCode(device);
        if (result.status === "active") {
          emitContext(`[TeamPulse] Device approved as user '${result.user?.name}'. Starting to report tasks.`);
        }
      } catch {
        // Ignore — next session will poll again.
      }
    } catch (err) {
      emitContext(`[TeamPulse not configured] Could not reach server: ${String(err.message || err)}`);
    }
    process.exit(0);
  }

  // Configured — resolve project + drain queue + fetch teammates + pull memory.
  const client = new TeamPulseApiClient(creds.server_url, creds.token);

  // Drain offline queue from previous network outages. Non-blocking.
  drainQueue((req) => client.req(req.method, req.path, req.body, { queueOnFailure: false }))
    .catch(() => ({}));

  const projectId = await resolveProject({ client, cwd });
  if (!projectId) {
    // Not a git repo or couldn't resolve — stay quiet.
    process.exit(0);
  }

  // Pull memory (fire-and-wait, short timeout). If it fails, don't block.
  try {
    await Promise.race([
      pullMemory({ apiClient: client, projectId, cwd }),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    // ignore
  }

  const res = await client.get(`/api/v1/tasks/active?project=${projectId}`);
  if (!res.ok) {
    process.exit(0);
  }

  const activeOthers = (res.data.tasks || []).filter((t) => t.user_name !== creds.user_name);
  if (activeOthers.length === 0) {
    process.exit(0);
  }

  const lines = activeOthers.slice(0, 10).map((t) => {
    const age = t.heartbeat_at ? ` (${relativeAge(t.heartbeat_at)})` : "";
    return `  • ${t.user_display_name || t.user_name} — "${t.intent}"${age}`;
  });
  emitContext(
    `[TeamPulse] ${activeOthers.length} teammate${activeOthers.length === 1 ? "" : "s"} active in this project:\n` +
      lines.join("\n") +
      "\nConsider if your planned work overlaps before starting."
  );

  process.exit(0);
}

function emitContext(message) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: message,
    },
  };
  process.stdout.write(JSON.stringify(payload));
}

function relativeAge(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} d ago`;
}

// Silence unused-import warnings (these used to be local before extraction).
void execFileSync;
void createHash;

main().catch(() => process.exit(0));
