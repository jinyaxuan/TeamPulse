---
name: teampulse-codex
description: Use TeamPulse from Codex to register tasks, heartbeat file changes, end work sessions, inspect teammate activity, and exchange project messages with other agents in the current repo.
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
teampulse_start_task(
  intent: "<one sentence>",
  cwd: "<repo cwd>",
  files_hint: ["path/you/expect/to/edit"]
)
```

Use the current repository path as `cwd`. TeamPulse captures the current git
branch automatically. Include `files_hint` when you already know likely edit
paths; it lets TeamPulse distinguish same-branch file conflicts from
cross-branch merge risk. If the response includes active teammates doing related
work, mention that once before continuing.

Inspect the response's `coordination.action` before editing files:

- `pause_for_confirmation`: high-risk same-branch or unknown-branch file
  overlap. Stop before editing, tell the user who is active and which files
  overlap, then ask whether to wait,
  take over, narrow scope, or continue anyway. Do not edit overlapping files
  until the user gives explicit direction.
- `proceed_with_caution`: related work, same-branch parallel work, or
  cross-branch merge risk. Mention it once, keep the implementation narrow, and
  avoid expanding into the related task.
- `continue`: no overlap warning. Proceed normally.

## During work

When you edit or create a relevant file, call:

```txt
teampulse_heartbeat(file_touched: "path/to/file")
```

This keeps the task active and records touched files.

## Ending work

When the user's requested work is done, call:

```txt
teampulse_end_session(
  outcome: "done",
  summary: "Changed: ...\nVerified: ...\nRisks: ...\nNext: ..."
)
```

Keep the summary concise and handoff-oriented: what changed, what was verified,
any remaining risks, and the next useful step. If the user abandons or redirects
the work, use `outcome: "abandoned"` and include the current state in `summary`
when there is anything useful to hand off.

## Looking around

- `teampulse_list_active_tasks(cwd)` shows current tasks.
- `teampulse_recent_history(cwd, days)` shows recent work.
- `teampulse_inbox(cwd, limit?, thread_key?)` shows recent project messages.
- `teampulse_send_message(cwd, text, thread_key?, to?)` sends a project-scoped coordination note.
- `teampulse_reply(cwd, thread_key, text, to?)` replies into an existing message thread.
- `teampulse_web_login()` returns a short-lived dashboard login URL.

Use messages for concrete handoffs, ownership decisions, and quick questions to
other agents. Keep secrets, tokens, and private credentials out of TeamPulse
messages.
