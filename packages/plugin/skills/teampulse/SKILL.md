---
name: teampulse
description: Team AI coordination — team awareness, shared memory across devices, task presence, and project messages between agents. Use when the user is working in a shared repo and their team uses TeamPulse.
---

# TeamPulse — Team Awareness

You have access to TeamPulse MCP tools that let you see what teammates are currently
working on and what they've done recently. Use this to avoid duplicate work and
to coordinate implicitly.

## When the session starts

If the SessionStart context contains `[TeamPulse]` lines listing active teammates,
**scan them once** at the start of the conversation. If any teammate's current
task looks related to what the user asks about next, **proactively mention it**:

> "I notice Alice started something similar 12 min ago: 'refactor auth middleware'.
>  Do you want to coordinate with her, or take a different angle?"

If no overlap, proceed normally without mentioning TeamPulse.

## When the user starts a new non-trivial task

Non-trivial = a new feature, refactor, bug fix, or exploratory spike (not "explain
this code" or "what does X do"). For those, call:

```
teampulse_start_task(
  intent: "<one-sentence summary of what we're about to do>",
  files_hint: ["path/you/expect/to/edit"]
)
```

TeamPulse captures the current git branch automatically. Include `files_hint`
when you already know likely edit paths; it lets TeamPulse distinguish
same-branch file conflicts from cross-branch merge risk. The response includes
`active_tasks`, `overlap_warnings`, and `coordination`.
Always inspect `coordination.action` before editing files:

- `pause_for_confirmation`: high-risk same-branch or unknown-branch file
  overlap. Stop before editing, tell the user who is active and which files
  overlap, then coordinate with the other agent or ask the user whether to wait,
  take over, narrow scope, or continue anyway. Agent-to-agent confirmation, or
  explicit user direction through the agent, is enough. Record the outcome with
  `teampulse_resolve_overlap`; no dashboard click is required. Do not edit
  overlapping files until coordination is confirmed.
- `proceed_with_caution`: related work, same-branch parallel work, or
  cross-branch merge risk. Mention it once, keep the implementation narrow, and
  avoid expanding into the related task.
- `continue`: no overlap warning. Proceed normally.

## When the user asks historical questions

If the user asks things like "what has Bob been working on", "what did the team
ship last week", "has anyone touched the payment code recently", call:

```
teampulse_recent_history(days: 7, user: "bob")  // optional filters
```

## Live updates mid-conversation

If a message labeled `[TeamPulse live update]` appears during the conversation,
it means a teammate JUST started something new. If it's related to the user's
current task, mention it once and let the user decide. Don't nag repeatedly.

## Agent Messages

Use project messages when coordination needs an explicit note or reply:

```txt
teampulse_inbox(limit: 20)
teampulse_send_message(
  thread_key: "project",
  text: "Working on auth tests; please avoid apps/web/src/lib/auth.ts for now."
)
teampulse_reply(
  thread_key: "task:<task id>",
  text: "Done with this side; safe to continue."
)
teampulse_resolve_overlap(
  first_task_id: "<task id>",
  second_task_id: "<task id>",
  action: "acknowledged",
  note: "Agents coordinated; continuing with split ownership."
)
```

Use `thread_key: "overlap:<key>"` for conflict-resolution threads. Send to a
specific member with `to` or `to_user_id` when the message is directed. Do not
include secrets, tokens, or private credentials in project messages.

## When the user ends the work session

Hooks handle `teampulse_end_task` automatically on session stop. If you manually
end the task or the tool is available in-session, include a concise handoff
summary:

```txt
teampulse_end_task(
  task_id: "<task id returned by teampulse_start_task>",
  outcome: "done",
  summary: "Changed: ...\nVerified: ...\nRisks: ...\nNext: ..."
)
```

For redirected or abandoned work, use `outcome: "abandoned"` and summarize the
current state and remaining next step.

## If TeamPulse is not configured

If the SessionStart context says `[TeamPulse 待认领]` or `[TeamPulse not configured]`,
the plugin needs to be claimed by the currently logged-in TeamPulse account.
Tell the user:

> "TeamPulse needs approval on this device. Your device code is **AB-CD-EF**.
>  Open `<server_url>/settings/connect` while logged into the correct account,
>  enter this code, then start a new Claude Code session. This is a one-time setup."

Use the exact claim code from the context. The account that submits the code
owns this device. Once claimed, the plugin auto-configures on the next session
by writing `~/.teampulse/credentials.json`.

## Opting out

If the user says they want to pause reporting (e.g. "stop telling my team what
I'm doing"), instruct them to set `TEAMPULSE_DISABLED=1` in their shell for the
current session, or visit the web dashboard to pause at the project level.

## Tools reference

- `teampulse_start_task(intent)` — begin a new tracked task. Returns teammates currently active in this project.
- `teampulse_end_task(task_id, outcome?, summary?)` — mark a task as done and save a handoff summary (hooks usually handle this).
- `teampulse_list_active_tasks()` — who's active right now in this project.
- `teampulse_recent_history(days?, user?)` — past tasks in this project.
- `teampulse_inbox(limit?, thread_key?)` — recent project messages.
- `teampulse_send_message(text, thread_key?, to?)` — send a project-scoped coordination note.
- `teampulse_reply(thread_key, text, to?)` — reply into an existing message thread.
- `teampulse_status()` — connection + login status.
- `teampulse_web_login()` — generate a magic URL to log into the web dashboard.
