function buildSkillMarkdown(appUrl: string) {
  const connectorUrl = `${appUrl}/agent/teampulse-connect.mjs`;

  return `---
name: teampulse-agent
description: Connect an AI coding agent to TeamPulse without requiring the TeamPulse source repo. Use when a user asks to register an agent/device with TeamPulse, bind a claim code, check connection status, register task start/end status, heartbeat file changes, inspect active TeamPulse tasks, or exchange project messages with other agents from Codex, Claude Code, OpenClaw, Skillhub, or another terminal-capable agent.
---

# TeamPulse Agent

Use this skill to connect the current machine or agent runtime to TeamPulse.
Do not require the TeamPulse project source, pnpm, or repo-local packages.
After credentials are configured, use this skill for non-trivial implementation,
debugging, refactoring, review, or investigation work so TeamPulse can show what
the agent is doing.

TeamPulse server URL: ${appUrl}
Connector script URL: ${connectorUrl}

## Install Connector

Download the public connector script:

\`\`\`bash
mkdir -p "$HOME/.teampulse/bin"
curl -fsSL "${connectorUrl}" -o "$HOME/.teampulse/bin/teampulse-connect.mjs"
chmod 700 "$HOME/.teampulse/bin/teampulse-connect.mjs"
\`\`\`

## First-Time Connection

Register the local device:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" register --server-url ${appUrl}
\`\`\`

Return only the printed claim_code to the user. Do not paste device_secret.

After the user confirms that they bound the claim_code in TeamPulse, poll for the token:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" poll --server-url ${appUrl}
\`\`\`

Confirm that credentials were written to ~/.teampulse/credentials.json.

## Status

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" status
\`\`\`

## Updating

Update the connector script without rebinding the device:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" update
\`\`\`

The command downloads the latest connector from ${appUrl} and replaces the
current script. Existing ~/.teampulse/credentials.json credentials are
preserved. If credentials are not configured yet, pass the server explicitly:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" update --server-url ${appUrl}
\`\`\`

Check the installed connector version:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" version
\`\`\`

## Task Tracking

At the start of a non-trivial task, first inspect active work in the current
repo, then register this task:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" active --cwd "<repo cwd>"
node "$HOME/.teampulse/bin/teampulse-connect.mjs" start --intent "<one sentence>" --cwd "<repo cwd>" --files "path/you/expect/to/edit"
\`\`\`

If the active task response shows related teammates, mention that once before
continuing. The connector captures the current git branch automatically. Include
--files when you already know likely edit paths; it lets TeamPulse distinguish
same-branch file conflicts from cross-branch merge risk.

After start, inspect the JSON response's coordination.action before editing
files:

- pause_for_confirmation: high-risk same-branch or unknown-branch file
  overlap. Stop before editing, tell the user who is active and which files
  overlap, then ask whether to wait,
  take over, narrow scope, or continue anyway. Do not edit overlapping files
  until the user gives explicit direction.
- proceed_with_caution: related work, same-branch parallel work, or
  cross-branch merge risk. Mention it once, keep the implementation narrow, and
  avoid expanding into the related task.
- continue: no overlap warning. Proceed normally.

During work, send a heartbeat after editing or creating a relevant file:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" heartbeat --file "<path>"
\`\`\`

At the end of the task, close the TeamPulse session:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" end --outcome done \\
  --summary "Changed: ...; Verified: ...; Risks: ...; Next: ..."
\`\`\`

If the user redirects or abandons the work, use:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" end --outcome abandoned \\
  --summary "Stopped at: ...; Remaining: ..."
\`\`\`

For longer handoffs, write the summary to a file and pass \`--summary-file\`.
Keep it focused on changed files/behavior, verification, residual risks, and
the next useful step.

For recent activity:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" history --days 7 --cwd "<repo cwd>"
\`\`\`

## Agent Messages

Read recent project messages:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" inbox --cwd "<repo cwd>" --limit 20
\`\`\`

Send a project-scoped note:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" message --cwd "<repo cwd>" \\
  --thread "project" --text "Working on auth tests; please avoid apps/web/src/lib/auth.ts for now."
\`\`\`

Send to a specific project member by name/email, or reply in a task/overlap thread:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" message --cwd "<repo cwd>" --to alice \\
  --thread "overlap:<key>" --text "I can take the migration; you keep the UI."
node "$HOME/.teampulse/bin/teampulse-connect.mjs" reply --cwd "<repo cwd>" \\
  --thread "task:<task id>" --text "Done with this side; safe to continue."
\`\`\`

Use messages for concrete coordination and handoffs. Do not paste secrets,
tokens, or private credentials into project messages.

## Rules

- Treat device_secret, returned token, and ~/.teampulse/credentials.json as sensitive.
- Do not paste the token into chat unless the user explicitly asks.
- Do not bind the claim code to the wrong TeamPulse account. The account that submits the code owns the device.
- If poll returns pending, tell the user the claim code still needs to be bound on ${appUrl}/settings/connect.
- For non-trivial work, do not skip task start/end tracking once status shows configured.
`;
}

export function GET(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const appUrl = (process.env.PUBLIC_APP_URL ?? requestOrigin).replace(/\/$/, "");

  return new Response(buildSkillMarkdown(appUrl), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
