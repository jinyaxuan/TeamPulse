import { resolveProject } from "../../plugin/mcp-server/project-resolve.js";

const uuid = { type: "string", format: "uuid" };
const version = { type: "integer", minimum: 1 };
const criteria = { type: "array", items: { type: "string" }, maxItems: 50 };
const policy = { type: "string", enum: ["human", "agent", "both"] };
const itemId = { work_item_id: uuid };

export const workItemTools = [
  {
    name: "teampulse_search_knowledge",
    description: "Search published knowledge in a project by keyword or tag. Draft and archived records are excluded.",
    inputSchema: {
      type: "object",
      properties: { cwd: { type: "string" }, project_id: uuid, q: { type: "string" }, tag: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } },
    },
  },
  {
    name: "teampulse_list_work_items",
    description: "List durable requirements and tasks for a project. Resolves the project from cwd unless project_id is provided.",
    inputSchema: {
      type: "object",
      properties: { cwd: { type: "string" }, project_id: uuid, status: { type: "string" }, parent_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500 } },
    },
  },
  {
    name: "teampulse_get_work_item",
    description: "Read a work item with its current version, linked execution sessions, evidence, reviews, knowledge and audit trail.",
    inputSchema: { type: "object", properties: itemId, required: ["work_item_id"] },
  },
  {
    name: "teampulse_triage_work_item",
    description: "Ask JEV for structured work-item triage recommendations. This sends work-item details to external provider TypeSafe. Set confirm_external_transfer to true only after acknowledging that transfer. Does not change priority or assignment; use the latest work-item version.",
    inputSchema: {
      type: "object",
      properties: { ...itemId, version, confirm_external_transfer: { type: "boolean", const: true } },
      required: ["work_item_id", "version", "confirm_external_transfer"],
    },
  },
  {
    name: "teampulse_create_work_item",
    description: "Capture a requirement or task with acceptance criteria. Assignment and reviewer policy require project manager rights.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string" }, project_id: uuid,
        kind: { type: "string", enum: ["requirement", "task"] },
        title: { type: "string" }, description: { type: "string" },
        parent_id: uuid, acceptance_criteria: criteria, review_policy: policy,
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        due_at: { type: "string", format: "date-time" },
        assignee_user_id: uuid, assignee_device_id: uuid,
        reviewer_user_id: uuid, reviewer_device_id: uuid,
      },
      required: ["title"],
    },
  },
  {
    name: "teampulse_update_work_item",
    description: "Change a work item's stage, details, assignment or reviewers using the version returned by the latest read.",
    inputSchema: {
      type: "object",
      properties: {
        ...itemId, version, title: { type: "string" }, description: { type: "string" },
        acceptance_criteria: criteria, review_policy: policy,
        status: { type: "string", enum: ["intake", "clarifying", "ready", "assigned", "in_progress", "cancelled"] },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        due_at: { type: "string", format: "date-time" }, parent_id: uuid,
        assignee_user_id: uuid, assignee_device_id: uuid,
        reviewer_user_id: uuid, reviewer_device_id: uuid,
      },
      required: ["work_item_id", "version"],
    },
  },
  {
    name: "teampulse_link_work_session",
    description: "Attach a TeamPulse execution task_id to a durable work item. Link the session before completing it.",
    inputSchema: { type: "object", properties: { ...itemId, version, task_id: uuid }, required: ["work_item_id", "version", "task_id"] },
  },
  {
    name: "teampulse_submit_work_item",
    description: "Submit a work item for independent acceptance after at least one linked execution session is done.",
    inputSchema: {
      type: "object",
      properties: {
        ...itemId, version, summary: { type: "string" },
        evidence: { type: "array", maxItems: 20, items: { type: "object", properties: { kind: { type: "string" }, label: { type: "string" }, content: { type: "string" }, url: { type: "string", format: "uri" } }, required: ["kind", "label"] } },
      },
      required: ["work_item_id", "version", "summary"],
    },
  },
  {
    name: "teampulse_review_work_item",
    description: "Record an independent Agent acceptance review. Approval must confirm every criterion; the assignee cannot self-review.",
    inputSchema: {
      type: "object",
      properties: {
        ...itemId, version,
        decision: { type: "string", enum: ["approved", "changes_requested"] },
        criterion_results: { type: "object", additionalProperties: { type: "boolean" } },
        comment: { type: "string" },
      },
      required: ["work_item_id", "version", "decision", "criterion_results"],
    },
  },
  {
    name: "teampulse_create_knowledge",
    description: "Save a sourced knowledge draft from accepted work. Only a project manager may publish immediately.",
    inputSchema: {
      type: "object",
      properties: {
        ...itemId, title: { type: "string" }, content: { type: "string" },
        summary: { type: "string" }, tags: { type: "array", items: { type: "string" } },
        source_event_ids: { type: "array", items: uuid },
        status: { type: "string", enum: ["draft", "published"] },
      },
      required: ["work_item_id", "title", "content"],
    },
  },
  {
    name: "teampulse_update_knowledge",
    description: "Edit a knowledge draft or publish/archive it. Published content is immutable; archive and create a new draft to revise.",
    inputSchema: {
      type: "object",
      properties: {
        ...itemId, knowledge_id: uuid, title: { type: "string" }, content: { type: "string" },
        summary: { type: "string" }, tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["published", "archived"] },
      },
      required: ["work_item_id", "knowledge_id"],
    },
  },
];

const names = new Set(workItemTools.map((tool) => tool.name));

export async function callWorkItemTool(name, args, client, cwd) {
  if (!names.has(name)) return null;
  if (name === "teampulse_list_work_items" || name === "teampulse_create_work_item" || name === "teampulse_search_knowledge") {
    const projectId = args.project_id || await resolveProject({ client, cwd: cwd(args.cwd) });
    if (!projectId) return { ok: false, error: "project_id or resolvable cwd required" };
    if (name === "teampulse_search_knowledge") {
      const query = new URLSearchParams();
      for (const key of ["q", "tag", "limit"]) {
        if (args[key] !== undefined) query.set(key, String(args[key]));
      }
      const searchPath = `/api/v1/projects/${encodeURIComponent(projectId)}/knowledge`;
      return client.get(query.size ? `${searchPath}?${query}` : searchPath);
    }
    const path = `/api/v1/projects/${encodeURIComponent(projectId)}/work-items`;
    if (name === "teampulse_create_work_item") return client.post(path, without(args, "cwd", "project_id"));
    const query = new URLSearchParams();
    for (const key of ["status", "parent_id", "limit"]) {
      if (args[key] !== undefined) query.set(key, String(args[key]));
    }
    return client.get(query.size ? `${path}?${query}` : path);
  }

  if (!isUuid(args.work_item_id)) return { ok: false, error: "work_item_id must be a UUID" };
  const path = `/api/v1/work-items/${encodeURIComponent(args.work_item_id)}`;
  switch (name) {
    case "teampulse_get_work_item": return client.get(path);
    case "teampulse_triage_work_item":
      if (args.confirm_external_transfer !== true) {
        return { ok: false, error: "confirm_external_transfer must be true before sending work-item details to TypeSafe" };
      }
      return client.post(`${path}/triage`, { version: args.version });
    case "teampulse_update_work_item": return client.patch(path, without(args, "work_item_id"));
    case "teampulse_link_work_session": return client.post(`${path}/sessions`, without(args, "work_item_id"));
    case "teampulse_submit_work_item": return client.post(`${path}/submit`, without(args, "work_item_id"));
    case "teampulse_review_work_item": return client.post(`${path}/reviews`, without(args, "work_item_id"));
    case "teampulse_create_knowledge": return client.post(`${path}/knowledge`, without(args, "work_item_id"));
    case "teampulse_update_knowledge": {
      if (!isUuid(args.knowledge_id)) return { ok: false, error: "knowledge_id must be a UUID" };
      return client.patch(`${path}/knowledge/${encodeURIComponent(args.knowledge_id)}`, without(args, "work_item_id", "knowledge_id"));
    }
  }
}

function without(value, ...keys) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
