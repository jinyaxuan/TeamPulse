---
name: teampulse-agent
description: Connect an AI coding agent to TeamPulse without requiring the TeamPulse source repo. Use when a user asks to register an agent/device with TeamPulse, bind a claim code to their account, poll for the issued token, write ~/.teampulse/credentials.json, or check TeamPulse connection status from Codex, Claude Code, OpenClaw, Skillhub, or another terminal-capable agent.
---

# TeamPulse Agent

Use this skill to connect the current machine or agent runtime to TeamPulse.
Do not require the TeamPulse project source, `pnpm`, or repo-local packages.

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

## Rules

- Treat `device_secret`, returned `token`, and `~/.teampulse/credentials.json` as sensitive.
- Do not paste the token into chat unless the user explicitly asks.
- Do not bind the claim code to the wrong TeamPulse account. The account that
  submits the code owns the device.
- If `poll` returns `pending`, tell the user the claim code still needs to be
  bound on `/settings/connect`.
