/**
 * Shared: read Claude Code's JSON stdin safely. Returns {} if unavailable,
 * malformed, or empty.
 */
import { readSync } from "node:fs";

export function readStdinSync() {
  try {
    const buf = Buffer.alloc(65536);
    let total = "";
    let n;
    try {
      while ((n = readSync(0, buf, 0, buf.length, null)) > 0) {
        total += buf.subarray(0, n).toString("utf-8");
        if (total.length > 1024 * 1024) break;
      }
    } catch {
      // EAGAIN / no stdin
    }
    return total ? JSON.parse(total) : {};
  } catch {
    return {};
  }
}
