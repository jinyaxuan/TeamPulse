/**
 * Thin HTTP client for the TeamPulse server. Handles bearer auth, request/response
 * serialization, and safe error handling (never throws — returns {ok, data, error}).
 *
 * Any write request that fails with a network-level error (not a 4xx/5xx from
 * the server) is automatically enqueued for retry on the next SessionStart.
 * Pass { queueOnFailure: false } to opt out (e.g. for login/claim-code where
 * retrying stale intent makes no sense).
 */
import { request } from "undici";
import { enqueue } from "./queue.js";

const QUEUEABLE_METHODS = new Set(["POST", "PATCH", "PUT"]);
const QUEUEABLE_PATHS = [
  /^\/api\/v1\/tasks$/,
  /^\/api\/v1\/tasks\/heartbeat$/,
  /^\/api\/v1\/tasks\/end-session$/,
  /^\/api\/v1\/tasks\/[^/]+$/,
  /^\/api\/v1\/memory\/[^/]+$/,
  /^\/api\/v1\/projects\/[^/]+\/messages$/,
];

function isQueueable(method, path) {
  if (!QUEUEABLE_METHODS.has(method)) return false;
  return QUEUEABLE_PATHS.some((re) => re.test(path));
}

export class TeamPulseApiClient {
  constructor(serverUrl, token) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.token = token;
  }

  async req(method, path, body, opts = {}) {
    const queueOnFailure =
      opts.queueOnFailure !== false && isQueueable(method, path);

    try {
      const res = await request(`${this.serverUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(opts.headers || {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        headersTimeout: 3000,
        bodyTimeout: 3000,
      });

      const text = await res.body.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          return {
            ok: false,
            status: res.statusCode,
            error: `invalid JSON: ${text.slice(0, 100)}`,
          };
        }
      }

      if (res.statusCode >= 400) {
        // Server-side rejection — don't queue (resending won't help).
        return {
          ok: false,
          status: res.statusCode,
          error: data?.error ?? `HTTP ${res.statusCode}`,
          data,
        };
      }

      return { ok: true, status: res.statusCode, data };
    } catch (err) {
      // Network-level failure (DNS, connection refused, timeout, etc.).
      if (queueOnFailure) {
        await enqueue({ method, path, body });
      }
      return {
        ok: false,
        status: 0,
        error: String(err?.message ?? err),
        queued: queueOnFailure,
      };
    }
  }

  get(path, opts) {
    return this.req("GET", path, undefined, opts);
  }
  post(path, body, opts) {
    return this.req("POST", path, body, opts);
  }
  patch(path, body, opts) {
    return this.req("PATCH", path, body, opts);
  }
  put(path, body, opts) {
    return this.req("PUT", path, body, opts);
  }
  delete(path, opts) {
    return this.req("DELETE", path, undefined, opts);
  }
}
