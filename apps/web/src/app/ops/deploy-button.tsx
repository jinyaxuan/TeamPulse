"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui/action-link";
import { withBasePath } from "@/lib/base-path";

export function DeployButton({
  serviceKey,
  disabled,
}: {
  serviceKey: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function triggerDeploy() {
    setState("pending");
    setMessage("");
    try {
      const response = await fetch(withBasePath(`/api/v1/ops/services/${serviceKey}/deploy`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data.error ?? data.message ?? `HTTP ${response.status}`);
      }
      setState("done");
      setMessage("已触发");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "触发失败");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ActionButton
        type="button"
        variant="primary"
        pending={state === "pending"}
        disabled={disabled || state === "pending"}
        onClick={triggerDeploy}
        className="min-w-24"
      >
        {state === "pending" ? "触发中" : "发布 main"}
      </ActionButton>
      {message && (
        <div className={state === "error" ? "max-w-56 text-right text-xs text-red-700" : "text-xs text-muted-foreground"}>
          {message}
        </div>
      )}
    </div>
  );
}
