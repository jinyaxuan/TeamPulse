#!/usr/bin/env node
/**
 * TeamPulse MCP server — runs as a long-lived stdio MCP server that Claude Code
 * starts on demand. Exposes MCP tools for LLM coordination + handles credential
 * bootstrapping and SSE subscription.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFileSync } from "node:child_process";
import { TeamPulseApiClient } from "./api-client.js";
import { isDisabled, readCredentials } from "./auth.js";
import { withCoordinationAdvice } from "./coordination.js";
import { LiveEvents } from "./live-events.js";
import { resolveProject } from "./project-resolve.js";

const server = new Server(
  {
    name: "teampulse",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Lazy-loaded API client. Recreated if credentials change.
let cachedClient = null;
let liveEvents = null;
async function getClient() {
  if (isDisabled()) return null;
  if (cachedClient) return cachedClient;
  const creds = await readCredentials();
  if (!creds) return null;
  cachedClient = new TeamPulseApiClient(creds.server_url, creds.token);
  liveEvents = new LiveEvents({ serverUrl: creds.server_url, token: creds.token });
  return cachedClient;
}

function getLiveEvents() {
  return liveEvents;
}

function gitBranch(cwd) {
  try {
    const out = execFileSync("git", ["-C", cwd, "branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function notConfiguredResult() {
  return {
    content: [
      {
        type: "text",
        text:
          "TeamPulse is not configured on this device yet. The SessionStart hook should have shown a claim code; open /settings/connect while logged into the target account and bind that code.",
      },
    ],
    isError: true,
  };
}

// ---------- Tool schemas ----------

const TOOLS = [
  {
    name: "teampulse_start_task",
    description:
      "Register a new task you're about to start. Returns active teammates, overlap warnings, and coordination instructions. Call at the beginning of any non-trivial piece of work.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "One-sentence description of what the user wants to do. Max 500 chars.",
          maxLength: 500,
        },
        files_hint: {
          type: "array",
          items: { type: "string" },
          description: "Optional: file paths you expect to modify.",
        },
        branch: {
          type: "string",
          description: "Optional branch override. Defaults to the current git branch for cwd.",
        },
        cwd: {
          type: "string",
          description: "Repository cwd. Defaults to process cwd.",
        },
        project_id: {
          type: "string",
          description: "Optional explicit TeamPulse project id.",
        },
      },
      required: ["intent"],
    },
  },
  {
    name: "teampulse_end_task",
    description: "Mark the current task as finished. Usually invoked automatically by Stop hook; only call manually if the user explicitly ends work.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        outcome: { type: "string", enum: ["done", "abandoned"] },
        summary: {
          type: "string",
          description: "Optional handoff summary: what changed, tests run, risks, and next steps. Max 2000 chars.",
          maxLength: 2000,
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "teampulse_list_active_tasks",
    description: "List teammates currently active in the current project. Use when you want to know who's doing what right now.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        all_projects: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "teampulse_recent_history",
    description: "Fetch recent finished tasks for this project — useful when the user asks 'what has the team been doing' or 'has anyone worked on X recently'.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 30, default: 7 },
        user: { type: "string", description: "Optional filter: a specific user name." },
        cwd: { type: "string" },
      },
    },
  },
  {
    name: "teampulse_status",
    description: "Show TeamPulse connection status: whether logged in, which server, which user this device is claimed by.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "teampulse_web_login",
    description: "Generate a one-time URL the user can open in a browser to log into the TeamPulse web dashboard (magic link, 10-minute expiry).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "teampulse_send_message",
    description:
      "Send a project-scoped message to other agents. Use for handoffs, questions, and coordination notes.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        project_id: { type: "string" },
        text: { type: "string", maxLength: 2000 },
        thread_key: {
          type: "string",
          description: "Optional thread key, e.g. project, task:<task id>, overlap:<overlap key>.",
          maxLength: 160,
        },
        task_id: { type: "string" },
        to: {
          type: "string",
          description: "Optional project member name, display name, or email.",
        },
        to_user_id: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "teampulse_reply",
    description: "Reply to an existing TeamPulse message thread.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        project_id: { type: "string" },
        thread_key: { type: "string", maxLength: 160 },
        text: { type: "string", maxLength: 2000 },
        to: { type: "string" },
        to_user_id: { type: "string" },
      },
      required: ["thread_key", "text"],
    },
  },
  {
    name: "teampulse_resolve_overlap",
    description:
      "Record how an active task overlap was coordinated. Use after agent-to-agent coordination or explicit user direction; no TeamPulse dashboard click is required.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        project_id: { type: "string" },
        first_task_id: { type: "string" },
        second_task_id: { type: "string" },
        action: {
          type: "string",
          enum: ["acknowledged", "handoff", "paused"],
          description: "acknowledged = coordinated and continuing; handoff = one agent takes over; paused = waiting.",
        },
        note: {
          type: "string",
          description: "Optional short note describing the coordination decision.",
          maxLength: 1000,
        },
      },
      required: ["first_task_id", "second_task_id", "action"],
    },
  },
  {
    name: "teampulse_inbox",
    description: "Read recent TeamPulse project messages for the current repo.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        project_id: { type: "string" },
        thread_key: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        mine: {
          type: "boolean",
          description: "When true, only messages authored by or addressed to the current user.",
          default: false,
        },
      },
    },
  },
  {
    name: "teampulse_recent_events",
    description:
      "Return recent teammate activity events (task.started, task.updated, task.ended, message.created) that arrived via the live subscription. Use this mid-conversation to check if a teammate just started overlapping work or sent a project message.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project ID to query. Required the first time per project (establishes the subscription).",
        },
        since_ms: {
          type: "number",
          description: "Epoch milliseconds; only events at or after this time. Omit for all buffered.",
        },
      },
      required: ["project_id"],
    },
  },
];

// ---------- Tool handlers ----------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const client = await getClient();
  if (!client) return notConfiguredResult();

  switch (name) {
    case "teampulse_status": {
      const creds = await readCredentials();
      return textResult({
        logged_in: true,
        server_url: creds?.server_url,
        user_name: creds?.user_name,
        device_id: creds?.device_id,
        version: "0.1.0",
      });
    }

    case "teampulse_start_task": {
      const cwd = args.cwd || process.env.PWD || process.cwd();
      const projectId = args.project_id || (await resolveProject({ client, cwd }));
      if (!projectId) return errorResult(`Could not resolve TeamPulse project from cwd: ${cwd}`);

      const res = await client.post("/api/v1/tasks", {
        intent: args.intent,
        files_hint: args.files_hint,
        branch: args.branch ? String(args.branch).trim().slice(0, 256) : gitBranch(cwd),
        client: "claude-code",
        project_id: projectId,
        session_id: process.env.CLAUDE_SESSION_ID || "unknown",
      });
      if (!res.ok) return errorResult(res.error);
      // Subscribe to live events for this project so subsequent
      // teampulse_recent_events calls return fresh data.
      const le = getLiveEvents();
      if (le && res.data?.project_id) le.subscribe(res.data.project_id);
      return textResult(withCoordinationAdvice(res.data));
    }

    case "teampulse_end_task": {
      const res = await client.patch(`/api/v1/tasks/${args.task_id}`, {
        status: args.outcome || "done",
        summary: args.summary ? String(args.summary).trim().slice(0, 2000) : undefined,
      });
      if (!res.ok) return errorResult(res.error);
      return textResult(res.data);
    }

    case "teampulse_list_active_tasks": {
      let path = "/api/v1/tasks/active";
      if (!args.all_projects) {
        const projectId = await resolveProject({
          client,
          cwd: args.cwd || process.env.PWD || process.cwd(),
        });
        if (projectId) path += `?project=${encodeURIComponent(projectId)}`;
      }
      const res = await client.get(path);
      if (!res.ok) return errorResult(res.error);
      return textResult(res.data);
    }

    case "teampulse_recent_history": {
      const days = args.days ?? 7;
      const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
      const params = new URLSearchParams({ since: sinceIso });
      if (args.user) params.set("user", args.user);
      const projectId = await resolveProject({
        client,
        cwd: args.cwd || process.env.PWD || process.cwd(),
      });
      if (projectId) params.set("project", projectId);
      const res = await client.get(`/api/v1/tasks/history?${params}`);
      if (!res.ok) return errorResult(res.error);
      return textResult(res.data);
    }

    case "teampulse_web_login": {
      const res = await client.post("/api/v1/auth/magic", {});
      if (!res.ok) return errorResult(res.error);
      return textResult({
        url: res.data.url,
        expires_in: "10 minutes",
        instructions: "Open this URL in your browser to log into the TeamPulse dashboard.",
      });
    }

    case "teampulse_send_message":
    case "teampulse_reply": {
      const cwd = args.cwd || process.env.PWD || process.cwd();
      const projectId = args.project_id || (await resolveProject({ client, cwd }));
      if (!projectId) return errorResult(`Could not resolve TeamPulse project from cwd: ${cwd}`);
      const text = String(args.text || "").trim().slice(0, 2000);
      if (!text) return errorResult("text is required");
      const res = await client.post(`/api/v1/projects/${projectId}/messages`, {
        body: text,
        thread_key: args.thread_key,
        task_id: args.task_id,
        to: args.to,
        to_user_id: args.to_user_id,
      });
      const le = getLiveEvents();
      if (le) le.subscribe(projectId);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    }

    case "teampulse_resolve_overlap": {
      const cwd = args.cwd || process.env.PWD || process.cwd();
      const projectId = args.project_id || (await resolveProject({ client, cwd }));
      if (!projectId) return errorResult(`Could not resolve TeamPulse project from cwd: ${cwd}`);
      const res = await client.post(`/api/v1/projects/${projectId}/overlaps`, {
        first_task_id: args.first_task_id,
        second_task_id: args.second_task_id,
        action: args.action,
        note: args.note ? String(args.note).trim().slice(0, 1000) : undefined,
      });
      const le = getLiveEvents();
      if (le) le.subscribe(projectId);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    }

    case "teampulse_inbox": {
      const cwd = args.cwd || process.env.PWD || process.cwd();
      const projectId = args.project_id || (await resolveProject({ client, cwd }));
      if (!projectId) return errorResult(`Could not resolve TeamPulse project from cwd: ${cwd}`);
      const params = new URLSearchParams({
        limit: String(Math.max(1, Math.min(100, Number(args.limit ?? 20)))),
      });
      if (args.thread_key) params.set("thread_key", String(args.thread_key));
      if (args.mine) params.set("inbox", "1");
      const res = await client.get(`/api/v1/projects/${projectId}/messages?${params}`);
      const le = getLiveEvents();
      if (le) le.subscribe(projectId);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    }

    case "teampulse_recent_events": {
      const le = getLiveEvents();
      if (!le) return errorResult("live events not initialized");
      // First call for a project establishes the subscription.
      le.subscribe(args.project_id);
      const result = le.takeRecent(args.project_id, args.since_ms || 0);
      return textResult({
        connected: result.connected,
        events: result.events,
        next_since_ms: Date.now(),
      });
    }

    default:
      return errorResult(`Unknown tool: ${name}`);
  }
});

function textResult(obj) {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}
function errorResult(message) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

// ---------- Main ----------

async function main() {
  if (isDisabled()) {
    process.stderr.write("[TeamPulse] disabled via TEAMPULSE_DISABLED=1\n");
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("TeamPulse MCP server failed:", err);
  process.exit(1);
});
