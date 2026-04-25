export type OverlapReason = "files" | "branch";

export type OverlapSeverity = "medium" | "high";

export type OverlapCandidate = {
  id: string;
  user_id?: string | null;
  user_name: string;
  user_display_name: string | null;
  intent: string;
  branch: string | null;
  files_touched: string[];
  started_at?: Date | string;
  heartbeat_at?: Date | string;
};

export type TaskOverlapWarning = {
  task_id: string;
  user_id?: string | null;
  user_name: string;
  user_display_name: string | null;
  intent: string;
  branch: string | null;
  reasons: OverlapReason[];
  severity: OverlapSeverity;
  overlapping_files: string[];
  started_at?: Date | string;
  heartbeat_at?: Date | string;
};

export type ActiveTaskOverlap = {
  first: TaskOverlapWarning;
  second: TaskOverlapWarning;
  reasons: OverlapReason[];
  severity: OverlapSeverity;
  overlapping_files: string[];
};

export function findTaskOverlapWarnings({
  branch,
  filesTouched,
  activeTasks,
}: {
  branch?: string | null;
  filesTouched: string[];
  activeTasks: OverlapCandidate[];
}): TaskOverlapWarning[] {
  return activeTasks
    .map((task) => {
      const overlappingFiles = overlappingPaths(filesTouched, task.files_touched);
      const reasons: OverlapReason[] = [];
      if (overlappingFiles.length > 0) reasons.push("files");
      if (sameBranch(branch, task.branch)) reasons.push("branch");

      if (reasons.length === 0) return null;
      return warningFromTask(task, reasons, overlappingFiles);
    })
    .filter((warning): warning is TaskOverlapWarning => Boolean(warning));
}

export function findActiveTaskOverlaps(tasks: OverlapCandidate[]): ActiveTaskOverlap[] {
  const overlaps: ActiveTaskOverlap[] = [];

  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const first = tasks[i];
      const second = tasks[j];
      const overlappingFiles = overlappingPaths(first.files_touched, second.files_touched);
      const reasons: OverlapReason[] = [];
      if (overlappingFiles.length > 0) reasons.push("files");
      if (sameBranch(first.branch, second.branch)) reasons.push("branch");
      if (reasons.length === 0) continue;

      overlaps.push({
        first: warningFromTask(first, reasons, overlappingFiles),
        second: warningFromTask(second, reasons, overlappingFiles),
        reasons,
        severity: severityFor(reasons),
        overlapping_files: overlappingFiles,
      });
    }
  }

  return overlaps;
}

function warningFromTask(
  task: OverlapCandidate,
  reasons: OverlapReason[],
  overlappingFiles: string[]
): TaskOverlapWarning {
  return {
    task_id: task.id,
    user_id: task.user_id,
    user_name: task.user_name,
    user_display_name: task.user_display_name,
    intent: task.intent,
    branch: task.branch,
    reasons,
    severity: severityFor(reasons),
    overlapping_files: overlappingFiles,
    started_at: task.started_at,
    heartbeat_at: task.heartbeat_at,
  };
}

function severityFor(reasons: OverlapReason[]): OverlapSeverity {
  return reasons.includes("files") ? "high" : "medium";
}

function sameBranch(a?: string | null, b?: string | null): boolean {
  const left = a?.trim();
  const right = b?.trim();
  return Boolean(left && right && left === right);
}

function overlappingPaths(left: string[], right: string[]): string[] {
  const normalizedRight = uniqueNormalized(right);
  const matches = new Set<string>();

  for (const original of left) {
    const normalizedLeft = normalizePath(original);
    if (!normalizedLeft) continue;

    for (const other of normalizedRight) {
      if (pathsOverlap(normalizedLeft, other)) {
        matches.add(normalizedLeft);
        break;
      }
    }
  }

  return Array.from(matches).sort();
}

function uniqueNormalized(paths: string[]): string[] {
  return Array.from(new Set(paths.map(normalizePath).filter(Boolean))).sort();
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
