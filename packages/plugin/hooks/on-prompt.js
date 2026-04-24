#!/usr/bin/env node
/**
 * UserPromptSubmit hook. Fire-and-forget reporting of new task intent.
 *
 * Budget: <100ms. Does NOT block on network. If anything fails, exit 0 silently.
 * Called by Claude Code every time the user submits a prompt.
 */
import { isDisabled, isPaused, readCredentials } from "../mcp-server/auth.js";
import { TeamPulseApiClient } from "../mcp-server/api-client.js";
import { resolveProject } from "../mcp-server/project-resolve.js";
import { readStdinSync } from "./_stdin.js";

async function main() {
  if (isDisabled()) process.exit(0);
  if (await isPaused()) process.exit(0);

  const input = readStdinSync();
  const prompt = input.user_message || input.prompt;
  const cwd = input.cwd || process.cwd();

  // "//noevo" prefix opts out for this prompt.
  if (typeof prompt === "string" && prompt.trim().startsWith("//noevo")) {
    process.exit(0);
  }

  const creds = await readCredentials();
  if (!creds || !prompt) process.exit(0);

  const client = new TeamPulseApiClient(creds.server_url, creds.token);
  const projectId = await resolveProject({ client, cwd });
  if (!projectId) process.exit(0);

  const intent = prompt.slice(0, 500);
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || "unknown";

  // Fire-and-forget: we don't await the full response to stay under budget.
  client
    .post("/api/v1/tasks", {
      project_id: projectId,
      session_id: sessionId,
      client: "claude-code",
      intent,
    })
    .catch(() => {});

  // Return immediately.
  process.exit(0);
}

main().catch(() => process.exit(0));
