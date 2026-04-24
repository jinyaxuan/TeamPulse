#!/usr/bin/env node
/**
 * PostToolUse hook — fires after Edit/Write/MultiEdit. Used to:
 *   1. Heartbeat the active task (so it doesn't turn to 'abandoned')
 *   2. Append the edited file to files_touched
 *
 * Debounced server-side (per task). Never blocks.
 */
import { isDisabled, readCredentials } from "../mcp-server/auth.js";
import { TeamPulseApiClient } from "../mcp-server/api-client.js";
import { readStdinSync } from "./_stdin.js";

async function main() {
  if (isDisabled()) process.exit(0);

  const input = readStdinSync();
  const filePath =
    input.tool_input?.file_path ||
    input.tool_input?.notebook_path ||
    input.tool_input?.path;
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID;

  if (!sessionId) process.exit(0);

  const creds = await readCredentials();
  if (!creds) process.exit(0);

  const client = new TeamPulseApiClient(creds.server_url, creds.token);

  // Heartbeat by session_id; server finds the latest active task for this
  // session and bumps heartbeat_at + appends filePath to files_touched.
  client
    .post(`/api/v1/tasks/heartbeat`, {
      session_id: sessionId,
      file_touched: filePath,
    })
    .catch(() => {});

  process.exit(0);
}

main().catch(() => process.exit(0));
