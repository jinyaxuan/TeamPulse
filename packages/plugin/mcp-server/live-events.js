/**
 * Long-lived SSE subscription to the TeamPulse server's /api/v1/stream.
 *
 * The MCP server subscribes once per project and buffers incoming task
 * events in a rolling in-memory list. Claude can call
 * `teampulse_recent_events()` mid-conversation to see what teammates have
 * started/ended since the last check.
 */
import { EventSource } from "eventsource";

const MAX_BUFFER = 50;

export class LiveEvents {
  constructor({ serverUrl, token }) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.token = token;
    /** @type {Map<string, {source: EventSource, events: Array, connected: boolean}>} */
    this.subs = new Map();
  }

  /**
   * Ensure we have a live subscription to a given project. Safe to call
   * repeatedly — it's a no-op if already connected.
   */
  subscribe(projectId) {
    if (!projectId) return;
    if (this.subs.has(projectId)) return;

    const url = `${this.serverUrl}/api/v1/stream?project=${encodeURIComponent(projectId)}`;
    const source = new EventSource(url, {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${this.token}`,
          },
        }),
    });

    const entry = { source, events: [], connected: false };
    this.subs.set(projectId, entry);

    source.addEventListener("open", () => {
      entry.connected = true;
    });
    source.addEventListener("error", () => {
      // EventSource auto-reconnects; we just note disconnect.
      entry.connected = false;
    });

    const record = (type) => (e) => {
      try {
        const data = JSON.parse(e.data);
        entry.events.push({ type, at: Date.now(), data });
        if (entry.events.length > MAX_BUFFER) {
          entry.events.splice(0, entry.events.length - MAX_BUFFER);
        }
      } catch {
        // ignore bad frame
      }
    };

    source.addEventListener("task.started", record("task.started"));
    source.addEventListener("task.updated", record("task.updated"));
    source.addEventListener("task.ended", record("task.ended"));
  }

  /**
   * Drain recent events (since a given timestamp) for a project. Defaults
   * to "everything currently buffered". Clears the buffer after draining —
   * the idea is each Claude tool call sees fresh events only.
   */
  takeRecent(projectId, sinceMs = 0) {
    const entry = this.subs.get(projectId);
    if (!entry) return { connected: false, events: [] };

    const events = entry.events.filter((e) => e.at >= sinceMs);
    // Keep the buffer so a second late caller still sees recent context;
    // only truncate via MAX_BUFFER.
    return { connected: entry.connected, events };
  }

  clear(projectId) {
    const entry = this.subs.get(projectId);
    if (entry) entry.events.length = 0;
  }

  close(projectId) {
    const entry = this.subs.get(projectId);
    if (entry) {
      entry.source.close();
      this.subs.delete(projectId);
    }
  }

  closeAll() {
    for (const [, entry] of this.subs) entry.source.close();
    this.subs.clear();
  }
}
