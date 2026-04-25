"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

export type OverlapResolutionRow = {
  key: string;
  first_task_id: string;
  second_task_id: string;
  action: string;
  note: string | null;
  resolved_by_name: string | null;
  resolved_by_display_name: string | null;
  updated_at: Date | string;
};

const actions = [
  { value: "acknowledged", label: "已沟通" },
  { value: "handoff", label: "已接手" },
  { value: "paused", label: "暂停等待" },
] as const;

export function OverlapActionControls({
  projectId,
  firstTaskId,
  secondTaskId,
  resolution,
  canResolve,
}: {
  projectId: string;
  firstTaskId: string;
  secondTaskId: string;
  resolution?: OverlapResolutionRow;
  canResolve: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function setAction(action: string) {
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/projects/${projectId}/overlaps`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_task_id: firstTaskId,
        second_task_id: secondTaskId,
        action,
      }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "更新冲突状态失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-amber-800">
          {resolution ? (
            <>
              当前处理：<strong>{overlapActionLabel(resolution.action)}</strong>
              {resolution.resolved_by_display_name || resolution.resolved_by_name
                ? ` · ${resolution.resolved_by_display_name ?? resolution.resolved_by_name}`
                : ""}
            </>
          ) : (
            "尚未记录处理状态"
          )}
        </div>
        {canResolve && (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.value}
                type="button"
                onClick={() => setAction(action.value)}
                disabled={pending || resolution?.action === action.value}
                className={
                  "rounded-md border border-amber-200 px-2 py-1 text-xs font-medium disabled:opacity-50 " +
                  (resolution?.action === action.value
                    ? "bg-amber-200 text-amber-950"
                    : "bg-white/70 text-amber-900 hover:bg-white")
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}

export function overlapActionLabel(action: string): string {
  if (action === "acknowledged") return "已沟通";
  if (action === "handoff") return "已接手";
  if (action === "paused") return "暂停等待";
  return action;
}
