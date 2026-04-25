---
name: teampulse-agent
description: Connect an AI coding agent to TeamPulse without requiring the TeamPulse source repo. Use when a user asks to register an agent/device with TeamPulse, bind a claim code, check connection status, register task start/end status, heartbeat file changes, or inspect active TeamPulse tasks from Codex, Claude Code, OpenClaw, Skillhub, or another terminal-capable agent.
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

Update the connector script without rebinding the device:

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
continuing. Include `--files` when you already know likely edit paths; it lets
TeamPulse detect direct file overlap before you start.

After `start`, inspect the JSON response's `coordination.action` before editing
files:

- `pause_for_confirmation`: high-risk file overlap. Stop before editing, tell
  the user who is active and which files overlap, then ask whether to wait,
  take over, narrow scope, or continue anyway. Do not edit overlapping files
  until the user gives explicit direction.
- `proceed_with_caution`: related work but no direct file overlap. Mention it
  once, keep the implementation narrow, and avoid expanding into the related
  task.
- `continue`: no overlap warning. Proceed normally.

During work, send a heartbeat after editing or creating a relevant file:

```bash
node scripts/teampulse-connect.mjs heartbeat --file "<path>"
```

At the end of the task, close the TeamPulse session:

```bash
node scripts/teampulse-connect.mjs end --outcome done
```

If the user redirects or abandons the work, use:

```bash
node scripts/teampulse-connect.mjs end --outcome abandoned
```

For recent activity:

```bash
node scripts/teampulse-connect.mjs history --days 7 --cwd "<repo cwd>"
```

## Rules

- Treat `device_secret`, returned `token`, and `~/.teampulse/credentials.json` as sensitive.
- Do not paste the token into chat unless the user explicitly asks.
- Do not bind the claim code to the wrong TeamPulse account. The account that
  submits the code owns the device.
- If `poll` returns `pending`, tell the user the claim code still needs to be
  bound on `/settings/connect`.
- For non-trivial work, do not skip task start/end tracking once `status` shows
  configured.
