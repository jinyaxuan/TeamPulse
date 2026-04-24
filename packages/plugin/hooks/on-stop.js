#!/usr/bin/env node
/**
 * Stop hook. End session tasks, push memory blob.
 */
import { isDisabled, isPaused, readCredentials } from "../mcp-server/auth.js";
import { TeamPulseApiClient } from "../mcp-server/api-client.js";
import { resolveProject } from "../mcp-server/project-resolve.js";
import { pushMemory } from "../mcp-server/memory-sync.js";
import { readStdinSync } from "./_stdin.js";

async function main() {
  if (isDisabled()) process.exit(0);
  if (await isPaused()) process.exit(0);

  const input = readStdinSync();
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID;
  const cwd = input.cwd || process.cwd();
  if (!sessionId) process.exit(0);

  const creds = await readCredentials();
  if (!creds) process.exit(0);

  const client = new TeamPulseApiClient(creds.server_url, creds.token);

  // End active tasks for this session — fire-and-forget.
  client
    .post(`/api/v1/tasks/end-session`, {
      session_id: sessionId,
      outcome: "done",
    })
    .catch(() => {});

  // Push memory — with a short deadline. Conflicts are logged to stderr but
  // don't block session shutdown.
  try {
    const projectId = await Promise.race([
      resolveProject({ client, cwd }),
      new Promise((r) => setTimeout(() => r(null), 800)),
    ]);
    if (projectId) {
      const result = await Promise.race([
        pushMemory({ apiClient: client, projectId, cwd }),
        new Promise((r) => setTimeout(() => r({ pushed: false, reason: "timeout" }), 1500)),
      ]);
      if (result?.reason === "conflict" && result.conflict_path) {
        process.stderr.write(
          `[TeamPulse] Memory conflict — your local copy saved to ${result.conflict_path}\n`
        );
      }
    }
  } catch {
    // ignore
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
