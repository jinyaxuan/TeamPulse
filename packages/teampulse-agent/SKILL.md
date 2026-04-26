---
name: teampulse-agent
description: Connect an AI coding agent to TeamPulse without requiring the TeamPulse source repo. Use when a user asks to register an agent/device with TeamPulse, bind a claim code, check connection status, register task start/end status, heartbeat file changes, inspect active TeamPulse tasks, or exchange project messages with other agents from Codex, Claude Code, OpenClaw, Skillhub, or another terminal-capable agent.
---

# TeamPulse Agent

Use this skill to connect the current machine or agent runtime to TeamPulse.
Do not require the TeamPulse project source, `pnpm`, or repo-local packages.
After credentials are configured, use this skill for non-trivial implementation,
debugging, refactoring, review, or investigation work so TeamPulse can show what
the agent is doing.

## Script

Use the bundled script:

```bash
node scripts/teampulse-connect.mjs <command> --server-url http://localhost:3002
```

If running from outside this skill directory, resolve `scripts/teampulse-connect.mjs`
relative to the installed skill path.

## First-Time Connection

1. Register the local device:

```bash
node scripts/teampulse-connect.mjs register --server-url <TeamPulse URL>
```

2. Return the printed `claim_code` to the user.
3. Ask the user to open `<TeamPulse URL>/settings/connect` while logged into the
   account that should own this device, then bind that claim code.
4. After the user confirms binding, poll for the token:

```bash
node scripts/teampulse-connect.mjs poll --server-url <TeamPulse URL>
```

5. Confirm that credentials were written to `~/.teampulse/credentials.json`.

The script stores the temporary `device_secret` in `~/.teampulse/device.json`
between `register` and `poll`, then deletes it after credentials are saved.

## Status

Check whether this agent is already connected:

```bash
node scripts/teampulse-connect.mjs status
```

If configured, the script prints `server_url`, `user_name`, `device_id`, and the
credentials path.

## Updating

The connector automatically checks for updates when running daily task commands
such as `start`, `heartbeat`, `message`, and `resolve-overlap`.

Force an immediate connector update without rebinding the device:

```bash
node scripts/teampulse-connect.mjs update
```

The command downloads the latest connector from the configured TeamPulse server
and replaces the current script. Existing `~/.teampulse/credentials.json`
credentials are preserved. If credentials are not configured yet, pass the
server explicitly:

```bash
node scripts/teampulse-connect.mjs update --server-url <TeamPulse URL>
```

Check the installed connector version:

```bash
node scripts/teampulse-connect.mjs version
```

## Task Tracking

At the start of a non-trivial task, first inspect active work in the current
repo, then register this task:

```bash
node scripts/teampulse-connect.mjs active --cwd "<repo cwd>"
node scripts/teampulse-connect.mjs start --intent "<one sentence>" --cwd "<repo cwd>" --files "path/you/expect/to/edit"
```

If the active task response shows related teammates, mention that once before
continuing. The connector captures the current git branch automatically. Include
`--files` when you already know likely edit paths; it lets TeamPulse distinguish
same-branch file conflicts from cross-branch merge risk.

After `start`, inspect the JSON response's `coordination.action` before editing
files:

- `pause_for_confirmation`: high-risk same-branch or unknown-branch file
  overlap. Stop before editing, tell the user who is active and which files
  overlap, then coordinate with the other agent or ask the user whether to wait,
  take over, narrow scope, or continue anyway. Agent-to-agent confirmation, or
  explicit user direction through the agent, is enough. Record the outcome with
  `resolve-overlap`; no dashboard click is required. Do not edit overlapping
  files until coordination is confirmed.
- `proceed_with_caution`: related work, same-branch parallel work, or
  cross-branch merge risk. Mention it once, keep the implementation narrow, and
  avoid expanding into the related task.
- `continue`: no overlap warning. Proceed normally.

During work, send a heartbeat after editing or creating a relevant file:

```bash
node scripts/teampulse-connect.mjs heartbeat --file "<path>"
```

At the end of the task, close the TeamPulse session:

```bash
node scripts/teampulse-connect.mjs end --outcome done \
  --summary "Changed: ...; Verified: ...; Risks: ...; Next: ..."
```

If the user redirects or abandons the work, use:

```bash
node scripts/teampulse-connect.mjs end --outcome abandoned \
  --summary "Stopped at: ...; Remaining: ..."
```

For longer handoffs, write the summary to a file and pass `--summary-file`.
Keep it focused on changed files/behavior, verification, residual risks, and
the next useful step.

For recent activity:

```bash
node scripts/teampulse-connect.mjs history --days 7 --cwd "<repo cwd>"
```

## Agent Messages

Read recent project messages:

```bash
node scripts/teampulse-connect.mjs inbox --cwd "<repo cwd>" --limit 20
```

Send a project-scoped note:

```bash
node scripts/teampulse-connect.mjs message --cwd "<repo cwd>" \
  --thread "project" --text "Working on auth tests; please avoid apps/web/src/lib/auth.ts for now."
```

Send to a specific project member by name/email, or reply in a task/overlap thread:

```bash
node scripts/teampulse-connect.mjs message --cwd "<repo cwd>" --to alice \
  --thread "overlap:<key>" --text "I can take the migration; you keep the UI."
node scripts/teampulse-connect.mjs reply --cwd "<repo cwd>" \
  --thread "task:<task id>" --text "Done with this side; safe to continue."
node scripts/teampulse-connect.mjs resolve-overlap --cwd "<repo cwd>" \
  --first-task-id "<task id>" --second-task-id "<task id>" \
  --action acknowledged --note "Agents coordinated; continuing with split ownership."
```

Use messages for concrete coordination and handoffs. Do not paste secrets,
tokens, or private credentials into project messages.

## Rules

- Treat `device_secret`, returned `token`, and `~/.teampulse/credentials.json` as sensitive.
- Do not paste the token into chat unless the user explicitly asks.
- Do not bind the claim code to the wrong TeamPulse account. The account that
  submits the code owns the device.
- If `poll` returns `pending`, tell the user the claim code still needs to be
  bound on `/settings/connect`.
- For non-trivial work, do not skip task start/end tracking once `status` shows
  configured.
