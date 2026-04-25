---
name: teampulse-codex
description: Use TeamPulse from Codex to register tasks, heartbeat file changes, end work sessions, and inspect teammate activity in the current repo.
---

# TeamPulse For Codex

Use the TeamPulse MCP tools when working in a repo where the team wants Codex
activity visible in TeamPulse.

## First-time setup

If `teampulse_status` says TeamPulse is not configured:

1. Call `teampulse_register_device`.
2. Tell the user the returned `claim_code`.
3. Ask the user to open TeamPulse `/settings/connect` while logged into the
   account that should own this device, then enter the code.
4. Call `teampulse_poll_device` after the user confirms the code is bound.

Credentials are saved in `~/.teampulse/credentials.json`.

## Starting work

For non-trivial implementation, debugging, refactoring, or investigation work,
call:

```txt
teampulse_start_task(intent: "<one sentence>", cwd: "<repo cwd>")
```

Use the current repository path as `cwd`. If the response includes active
teammates doing related work, mention that once before continuing.

## During work

When you edit or create a relevant file, call:

```txt
teampulse_heartbeat(file_touched: "path/to/file")
```

This keeps the task active and records touched files.

## Ending work

When the user's requested work is done, call:

```txt
teampulse_end_session(outcome: "done")
```

If the user abandons or redirects the work, use `outcome: "abandoned"`.

## Looking around

- `teampulse_list_active_tasks(cwd)` shows current tasks.
- `teampulse_recent_history(cwd, days)` shows recent work.
- `teampulse_web_login()` returns a short-lived dashboard login URL.
