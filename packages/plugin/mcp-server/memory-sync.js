/**
 * Memory LWW sync for the TeamPulse plugin.
 *
 * Protocol (see apps/web/src/app/api/v1/memory/[projectId]/route.ts):
 *   GET  /memory/:projectId       → 200 { content, version, updated_at, updated_device }
 *   PUT  /memory/:projectId       → 200/201 { version } | 409 { current_version, content }
 *
 * Local file: ~/.claude/projects/<hash>/memory/MEMORY.md
 * Claude Code creates the directory from a hashed cwd, so we detect it by
 * looking for the `memory/MEMORY.md` file inside any directory matching
 * cwd hash under `~/.claude/projects/`.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

/**
 * Compute Claude Code's project directory from a filesystem cwd.
 * Claude Code sanitizes the path (replaces / with - and prepends -) so we
 * do the same.
 */
export function claudeProjectDirFromCwd(cwd) {
  const sanitized = cwd.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", sanitized);
}

export function memoryFilePath(cwd) {
  return join(claudeProjectDirFromCwd(cwd), "memory", "MEMORY.md");
}

async function ensureDirFor(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readLocalMemory(cwd) {
  const p = memoryFilePath(cwd);
  try {
    const content = await readFile(p, "utf-8");
    const s = await stat(p);
    return { content, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

async function writeLocalMemory(cwd, content) {
  const p = memoryFilePath(cwd);
  await ensureDirFor(p);
  await writeFile(p, content, "utf-8");
}

/**
 * Pull from server. Writes local if remote is newer (by version).
 * Returns { version, was_updated }.
 */
export async function pullMemory({ apiClient, projectId, cwd }) {
  const res = await apiClient.get(`/api/v1/memory/${projectId}`);
  if (!res.ok) {
    // 404 → no server copy yet; nothing to pull.
    if (res.status === 404) return { version: null, was_updated: false };
    return { version: null, was_updated: false, error: res.error };
  }

  const local = await readLocalMemory(cwd);
  // If server content equals local byte-for-byte, skip write.
  if (local && local.content === res.data.content) {
    return { version: res.data.version, was_updated: false };
  }

  await writeLocalMemory(cwd, res.data.content);
  return { version: res.data.version, was_updated: true };
}

/**
 * Push local memory to server.
 *
 * We track the last-synced version per (cwd, project) in a sibling
 * ".teampulse-sync.json" file so we know what If-Match to send. First push
 * (no known version) is sent without If-Match → server returns 201.
 *
 * Conflict (409): we save the local copy to MEMORY.md.conflict-<ts>,
 * overwrite MEMORY.md with the server's copy, and bump our known version.
 */
export async function pushMemory({ apiClient, projectId, cwd }) {
  const local = await readLocalMemory(cwd);
  if (!local) return { pushed: false, reason: "no_local_file" };

  const state = await readSyncState(cwd, projectId);
  const headers = {};
  if (state.version != null) headers["If-Match"] = `"${state.version}"`;

  const res = await apiClient.req("PUT", `/api/v1/memory/${projectId}`, {
    content: local.content,
    device_name: hostname(),
  });

  if (res.status === 409 && res.data?.current_version) {
    // Conflict: save our version to a conflict file, accept server version.
    const conflictPath = `${memoryFilePath(cwd)}.conflict-${Date.now()}`;
    await writeFile(conflictPath, local.content, "utf-8");
    await writeLocalMemory(cwd, res.data.content);
    await writeSyncState(cwd, projectId, res.data.current_version);
    return {
      pushed: false,
      reason: "conflict",
      conflict_path: conflictPath,
      server_version: res.data.current_version,
    };
  }

  if (!res.ok) {
    return { pushed: false, reason: `http_${res.status}`, error: res.error };
  }

  await writeSyncState(cwd, projectId, res.data.version);
  return { pushed: true, version: res.data.version };
}

// ---------- Per-(cwd, project) sync state ----------

function syncStatePath(cwd) {
  return join(claudeProjectDirFromCwd(cwd), "memory", ".teampulse-sync.json");
}

async function readSyncState(cwd, projectId) {
  try {
    const raw = await readFile(syncStatePath(cwd), "utf-8");
    const data = JSON.parse(raw);
    return { version: data[projectId] ?? null };
  } catch {
    return { version: null };
  }
}

async function writeSyncState(cwd, projectId, version) {
  const p = syncStatePath(cwd);
  let current = {};
  if (existsSync(p)) {
    try {
      current = JSON.parse(await readFile(p, "utf-8"));
    } catch {
      current = {};
    }
  }
  current[projectId] = version;
  await ensureDirFor(p);
  await writeFile(p, JSON.stringify(current, null, 2), "utf-8");
}
