/**
 * Append-only offline queue for failed hook reports.
 *
 * When the backend is unreachable, hooks drop a JSONL line into
 * ~/.teampulse/queue/requests.jsonl. On next SessionStart (when the network
 * is presumably back), we drain the file line-by-line, re-sending each
 * request. If a line still fails, we rewrite only the failed lines back.
 *
 * Cap the file at 1 MB; oldest lines get dropped on overflow.
 */
import { appendFile, readFile, writeFile, stat, mkdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TEAMPULSE_DIR = join(homedir(), ".teampulse");
const QUEUE_DIR = join(TEAMPULSE_DIR, "queue");
const QUEUE_FILE = join(QUEUE_DIR, "requests.jsonl");
const MAX_BYTES = 1024 * 1024;

async function ensureDir() {
  await mkdir(QUEUE_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Append a request descriptor to the queue. Called by hook fire-and-forget
 * paths when the network call errors out.
 *
 * req shape: { method, path, body, created_at }
 */
export async function enqueue(req) {
  try {
    await ensureDir();
    const line = JSON.stringify({ ...req, created_at: req.created_at || Date.now() }) + "\n";
    await appendFile(QUEUE_FILE, line, { mode: 0o600 });
    await trimIfOversize();
  } catch {
    // If even the queue write fails (disk full?), give up silently.
  }
}

async function trimIfOversize() {
  try {
    const s = await stat(QUEUE_FILE);
    if (s.size <= MAX_BYTES) return;

    const raw = await readFile(QUEUE_FILE, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    // Drop oldest ~half. Simple and bounds recovery time.
    const keep = lines.slice(Math.floor(lines.length / 2));
    await writeFile(QUEUE_FILE, keep.join("\n") + (keep.length ? "\n" : ""), { mode: 0o600 });
  } catch {
    // ignore
  }
}

/**
 * Drain the queue by re-sending each buffered request. Returns
 * { attempted, succeeded, still_queued }.
 *
 * sendFn is injected by the caller: ({method, path, body}) => {ok: bool}.
 */
export async function drain(sendFn) {
  let raw;
  try {
    raw = await readFile(QUEUE_FILE, "utf-8");
  } catch {
    return { attempted: 0, succeeded: 0, still_queued: 0 };
  }

  const lines = raw.split("\n").filter(Boolean);
  if (lines.length === 0) return { attempted: 0, succeeded: 0, still_queued: 0 };

  // Remove the queue file up front. We'll re-write anything that fails.
  await unlink(QUEUE_FILE).catch(() => {});

  let succeeded = 0;
  const stillFailed = [];
  for (const line of lines) {
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      continue; // drop malformed
    }
    // Skip requests older than 7 days — stale intent is noise.
    if (req.created_at && Date.now() - req.created_at > 7 * 86400_000) continue;

    try {
      const res = await sendFn({ method: req.method, path: req.path, body: req.body });
      if (res && res.ok) {
        succeeded += 1;
      } else {
        stillFailed.push(line);
      }
    } catch {
      stillFailed.push(line);
    }
  }

  if (stillFailed.length > 0) {
    await ensureDir();
    await writeFile(QUEUE_FILE, stillFailed.join("\n") + "\n", { mode: 0o600 });
  }

  return {
    attempted: lines.length,
    succeeded,
    still_queued: stillFailed.length,
  };
}
