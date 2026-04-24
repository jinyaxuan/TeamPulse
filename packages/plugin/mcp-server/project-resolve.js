/**
 * Project identification for the TeamPulse plugin.
 *
 * Resolution priority:
 *   1. `.teampulse.json` in cwd or any ancestor (explicit project_id override)
 *      - also supports `overrides[]` for monorepo sub-paths
 *      - supports `"enabled": false` to disable for that repo
 *   2. `git remote get-url origin` → sha256 → server's /projects/resolve
 *   3. give up (returns null)
 */
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path";

// Simple per-process cache: cwd → {projectId, resolvedAt, disabled}.
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Returns project_id string, or null if resolution fails / disabled.
 */
export async function resolveProject({ client, cwd }) {
  const key = cwd;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
    return cached.disabled ? null : cached.projectId;
  }

  const result = await resolveFromConfigFile(cwd);
  if (result?.disabled) {
    cache.set(key, { disabled: true, resolvedAt: Date.now() });
    return null;
  }

  if (result?.projectId) {
    cache.set(key, { projectId: result.projectId, resolvedAt: Date.now() });
    return result.projectId;
  }

  const fromGit = await resolveFromGit(client, cwd);
  if (fromGit) {
    cache.set(key, { projectId: fromGit, resolvedAt: Date.now() });
  } else {
    cache.set(key, { resolvedAt: Date.now() });
  }
  return fromGit;
}

export function invalidateProjectCache(cwd) {
  if (cwd) cache.delete(cwd);
  else cache.clear();
}

// ---------- .teampulse.json walker ----------

async function resolveFromConfigFile(cwd) {
  let dir = resolvePath(cwd);
  while (true) {
    const candidate = join(dir, ".teampulse.json");
    try {
      await stat(candidate);
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return null; // reached filesystem root
      dir = parent;
      continue;
    }

    try {
      const raw = await readFile(candidate, "utf-8");
      const config = JSON.parse(raw);

      if (config.enabled === false) {
        return { disabled: true };
      }

      // Monorepo subpath overrides: pick the deepest matching `path`.
      if (Array.isArray(config.overrides) && config.overrides.length > 0) {
        const rel = relative(dir, resolvePath(cwd));
        const parts = rel.split(sep);
        // Try longest match first.
        const matches = config.overrides
          .filter((o) => o.path && o.projectId)
          .filter((o) => {
            const overrideParts = o.path.split("/");
            for (let i = 0; i < overrideParts.length; i++) {
              if (parts[i] !== overrideParts[i]) return false;
            }
            return true;
          })
          .sort((a, b) => b.path.length - a.path.length);
        if (matches[0]) return { projectId: matches[0].projectId };
      }

      if (config.projectId) return { projectId: config.projectId };
      return null;
    } catch {
      return null;
    }
  }
}

// ---------- git remote resolver ----------

async function resolveFromGit(client, cwd) {
  try {
    const remote = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1000,
    }).trim();
    if (!remote) return null;
    const normalized = remote.toLowerCase().replace(/\.git$/, "");
    const hash = createHash("sha256").update(normalized).digest("hex");
    const res = await client.post("/api/v1/projects/resolve", {
      git_remote_hash: hash,
      git_remote_url: remote,
    });
    return res.ok ? res.data?.project_id ?? null : null;
  } catch {
    return null;
  }
}
