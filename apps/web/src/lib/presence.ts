import { EventEmitter } from "node:events";

/**
 * Single-process presence bus. All tasks CRUD operations emit events here;
 * SSE endpoint subscribes per-project.
 *
 * Scales fine for 50 concurrent devs. When we outgrow this, swap in Redis
 * pub/sub without changing the call sites.
 */
declare global {
  var __teampulse_presence: EventEmitter | undefined;
}

// Persist across hot-reloads in dev (Next.js preserves `global` between HMR cycles).
export const presenceBus: EventEmitter =
  globalThis.__teampulse_presence ?? new EventEmitter();
if (!globalThis.__teampulse_presence) {
  presenceBus.setMaxListeners(0); // we may have many per-project listeners
  globalThis.__teampulse_presence = presenceBus;
}

export type PresenceEvent =
  | {
      type: "task.started";
      project_id: string;
      task: PresenceTaskPayload;
    }
  | {
      type: "task.updated";
      project_id: string;
      task: PresenceTaskPayload;
    }
  | {
      type: "task.ended";
      project_id: string;
      task_id: string;
      outcome: "done" | "abandoned";
    }
  | {
      type: "message.created";
      project_id: string;
      message: PresenceMessagePayload;
    };

export type PresenceTaskPayload = {
  id: string;
  project_id: string;
  user_id: string;
  user_name: string;
  user_display_name: string | null;
  intent: string;
  files_touched: string[];
  branch: string | null;
  status: string;
  started_at: string;
  heartbeat_at: string;
  client: string;
};

export type PresenceMessagePayload = {
  id: string;
  project_id: string;
  thread_key: string;
  body: string;
  author_id: string | null;
  author_name: string | null;
  author_display_name: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  target_user_display_name: string | null;
  task_id: string | null;
  created_at: string;
};

export function publishPresence(event: PresenceEvent): void {
  presenceBus.emit(`project:${event.project_id}`, event);
}
