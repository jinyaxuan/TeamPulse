---
name: teampulse
description: Team AI coordination — team awareness, shared memory across devices, and task presence. Use when the user is working in a shared repo and their team uses TeamPulse.
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
teampulse_start_task(intent: "<one-sentence summary of what we're about to do>")
```

The response includes `active_tasks` — a list of teammates currently working in
this project. If something looks related, tell the user before starting work.

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

## When the user ends the work session

No action needed — hooks handle `teampulse_end_task` automatically on session stop.

## If TeamPulse is not configured

If the SessionStart context says `[TeamPulse 待认领]` or `[TeamPulse not configured]`,
the plugin needs admin approval to work. Tell the user:

> "TeamPulse needs approval on this device. Your device code is **AB-CD-EF**.
>  Ask your admin to open `<server_url>/admin/devices` and approve it with your
>  name. This is a one-time setup."

Use the exact claim code from the context. Once admin approves, the plugin
auto-configures within ~10 seconds — no further action needed from the user.

## Opting out

If the user says they want to pause reporting (e.g. "stop telling my team what
I'm doing"), instruct them to set `TEAMPULSE_DISABLED=1` in their shell for the
current session, or visit the web dashboard to pause at the project level.

## Tools reference

- `teampulse_start_task(intent)` — begin a new tracked task. Returns teammates currently active in this project.
- `teampulse_end_task(outcome?)` — mark current task as done (hooks usually handle this).
- `teampulse_list_active_tasks()` — who's active right now in this project.
- `teampulse_recent_history(days?, user?)` — past tasks in this project.
- `teampulse_status()` — connection + login status.
- `teampulse_web_login()` — generate a magic URL to log into the web dashboard.
