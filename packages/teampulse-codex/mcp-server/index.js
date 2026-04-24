#!/usr/bin/env node
/**
 * TeamPulse MCP server for Codex.
 *
 * Uses the same ~/.teampulse credentials and HTTP API as the Claude Code
 * plugin, but resolves the active project from a Codex workspace cwd.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";
import { TeamPulseApiClient } from "../../plugin/mcp-server/api-client.js";
import {
  isDisabled,
  paths,
  pollClaimCode,
  readCredentials,
  registerDevice,
} from "../../plugin/mcp-server/auth.js";
import { LiveEvents } from "../../plugin/mcp-server/live-events.js";
import { resolveProject } from "../../plugin/mcp-server/project-resolve.js";

const server = new Server(
  {
    name: "teampulse-codex",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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

const TOOLS = [
  {
    name: "teampulse_status",
    description: "Show TeamPulse connection status for this Codex environment.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "teampulse_register_device",
    description:
      "Register this Codex environment as a TeamPulse device and return the claim code an admin must approve.",
    inputSchema: {
      type: "object",
      properties: {
        server_url: {
          type: "string",
          description: "TeamPulse server URL. Defaults to TEAMPULSE_SERVER_URL or http://localhost:3000.",
        },
      },
    },
  },
  {
    name: "teampulse_poll_device",
    description:
      "Poll TeamPulse after admin approval. Saves ~/.teampulse/credentials.json when approved.",
    inputSchema: {
      type: "object",
      properties: {
        server_url: {
          type: "string",
          description: "TeamPulse server URL used during registration.",
        },
      },
    },
  },
  {
    name: "teampulse_start_task",
    description:
      "Start a TeamPulse task for the current Codex work. Resolves the project from cwd and returns active teammates.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "One-sentence description of the work.",
          maxLength: 500,
        },
        cwd: {
          type: "string",
          description: "Repository cwd. Defaults to TEAMPULSE_CWD, CODEX_WORKSPACE, PWD, or process.cwd().",
        },
        files_hint: {
          type: "array",
          items: { type: "string" },
          description: "Optional file paths likely to be modified.",
        },
        session_id: {
          type: "string",
          description: "Optional stable Codex session id.",
        },
      },
      required: ["intent"],
    },
  },
  {
    name: "teampulse_heartbeat",
    description: "Heartbeat the latest active Codex task and optionally append a touched file.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        file_touched: { type: "string" },
      },
    },
  },
  {
    name: "teampulse_end_session",
    description: "Mark all active TeamPulse tasks for this Codex session as done or abandoned.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        outcome: { type: "string", enum: ["done", "abandoned"], default: "done" },
      },
    },
  },
  {
    name: "teampulse_list_active_tasks",
    description: "List active TeamPulse tasks in the current project or across all projects.",
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
    description: "Fetch recent TeamPulse task history for the current project.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        days: { type: "integer", minimum: 1, maximum: 30, default: 7 },
        user: { type: "string" },
      },
    },
  },
  {
    name: "teampulse_web_login",
    description: "Generate a one-time magic login URL for the TeamPulse web dashboard.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "teampulse_recent_events",
    description:
      "Subscribe to and read recent live TeamPulse task events for the current project.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" },
        project_id: { type: "string" },
        since_ms: { type: "number" },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      case "teampulse_status":
        return textResult(await statusPayload());

      case "teampulse_register_device": {
        const device = await registerDevice(args.server_url);
        return textResult({
          configured: false,
          status: "pending",
          server_url: device.server_url,
          device_id: device.device_id,
          claim_code: device.claim_code,
          next_step: "Open TeamPulse /admin/devices and approve this claim code.",
        });
      }

      case "teampulse_poll_device": {
        const device = await registerDevice(args.server_url);
        const result = await pollClaimCode(device);
        cachedClient = null;
        liveEvents = null;
        return textResult(result);
      }
    }

    const client = await getClient();
    if (!client) {
      return errorResult(
        `TeamPulse is not configured. Run teampulse_register_device first; credentials path: ${paths.CREDENTIALS_PATH}`
      );
    }

    switch (name) {
      case "teampulse_start_task": {
        const cwd = currentCwd(args.cwd);
        const projectId = await resolveProject({ client, cwd });
        if (!projectId) return errorResult(`Could not resolve TeamPulse project from cwd: ${cwd}`);

        const res = await client.post("/api/v1/tasks", {
          project_id: projectId,
          session_id: sessionId(args.session_id),
          client: "codex",
          intent: String(args.intent || "").trim().slice(0, 500),
          files_hint: args.files_hint,
        });
        if (!res.ok) return errorResult(res.error);
        if (liveEvents && res.data?.project_id) liveEvents.subscribe(res.data.project_id);
        return textResult(res.data);
      }

      case "teampulse_heartbeat": {
        const res = await client.post("/api/v1/tasks/heartbeat", {
          session_id: sessionId(args.session_id),
          file_touched: args.file_touched,
        });
        return res.ok ? textResult(res.data) : errorResult(res.error);
      }

      case "teampulse_end_session": {
        const res = await client.post("/api/v1/tasks/end-session", {
          session_id: sessionId(args.session_id),
          outcome: args.outcome || "done",
        });
        return res.ok ? textResult(res.data) : errorResult(res.error);
      }

      case "teampulse_list_active_tasks": {
        let path = "/api/v1/tasks/active";
        if (!args.all_projects) {
          const projectId = await resolveProject({ client, cwd: currentCwd(args.cwd) });
          if (projectId) path += `?project=${encodeURIComponent(projectId)}`;
        }
        const res = await client.get(path);
        return res.ok ? textResult(res.data) : errorResult(res.error);
      }

      case "teampulse_recent_history": {
        const params = new URLSearchParams({
          since: new Date(Date.now() - (args.days ?? 7) * 86400_000).toISOString(),
        });
        if (args.user) params.set("user", args.user);
        const projectId = await resolveProject({ client, cwd: currentCwd(args.cwd) });
        if (projectId) params.set("project", projectId);
        const res = await client.get(`/api/v1/tasks/history?${params}`);
        return res.ok ? textResult(res.data) : errorResult(res.error);
      }

      case "teampulse_web_login": {
        const res = await client.post("/api/v1/auth/magic", {});
        return res.ok
          ? textResult({
              url: res.data.url,
              expires_in: "10 minutes",
              instructions: "Open this URL in your browser to log into TeamPulse.",
            })
          : errorResult(res.error);
      }

      case "teampulse_recent_events": {
        const projectId =
          args.project_id || (await resolveProject({ client, cwd: currentCwd(args.cwd) }));
        if (!projectId) return errorResult("project_id or resolvable cwd required");
        if (!liveEvents) return errorResult("live events not initialized");
        liveEvents.subscribe(projectId);
        const result = liveEvents.takeRecent(projectId, args.since_ms || 0);
        return textResult({
          connected: result.connected,
          events: result.events,
          next_since_ms: Date.now(),
        });
      }

      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return errorResult(String(err?.message || err));
  }
});

async function statusPayload() {
  if (isDisabled()) return { configured: false, disabled: true };
  const creds = await readCredentials();
  if (!creds) {
    return {
      configured: false,
      credentials_path: paths.CREDENTIALS_PATH,
      next_step: "Call teampulse_register_device and approve the claim code in TeamPulse.",
    };
  }
  return {
    configured: true,
    server_url: creds.server_url,
    user_name: creds.user_name,
    device_id: creds.device_id,
    credentials_path: paths.CREDENTIALS_PATH,
  };
}

function currentCwd(arg) {
  return (
    arg ||
    process.env.TEAMPULSE_CWD ||
    process.env.CODEX_WORKSPACE ||
    process.env.PWD ||
    process.cwd()
  );
}

function sessionId(arg) {
  if (arg) return String(arg);
  if (process.env.TEAMPULSE_SESSION_ID) return process.env.TEAMPULSE_SESSION_ID;
  if (process.env.CODEX_SESSION_ID) return process.env.CODEX_SESSION_ID;
  const seed = currentCwd();
  return `codex-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("TeamPulse Codex MCP server failed:", err);
  process.exit(1);
});
