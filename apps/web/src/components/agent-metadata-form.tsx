"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import { type EditableAgentDevice } from "@/lib/agent-display";

const agentTypes = [
  { value: "", label: "未设置" },
  { value: "codex", label: "Codex" },
  { value: "claude-code", label: "Claude Code" },
  { value: "openclaw", label: "OpenClaw" },
  { value: "generic", label: "通用 Agent" },
] as const;

export function AgentMetadataForm({
  device,
  compact = false,
}: {
  device: EditableAgentDevice;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [agentName, setAgentName] = useState(device.agent_name ?? "");
  const [agentType, setAgentType] = useState(device.agent_type ?? "");
  const [agentRole, setAgentRole] = useState(device.agent_role ?? "");
  const [capabilitiesText, setCapabilitiesText] = useState(device.capabilities.join(", "));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeholderName = useMemo(() => {
    if (device.agent_type === "codex") return "例如 Codex 主力实现";
    if (device.agent_type === "claude-code") return "例如 Claude Code 代码审查";
    return device.hostname ? `${device.hostname} Agent` : "例如 前端实现 Agent";
  }, [device.agent_type, device.hostname]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const res = await fetch(withBasePath(`/api/v1/devices/${device.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_name: agentName.trim() || null,
        agent_type: agentType || null,
        agent_role: agentRole.trim() || null,
        capabilities: parseCapabilities(capabilitiesText),
      }),
    });

    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "保存 Agent 信息失败");
      return;
    }

    setMessage("Agent 信息已保存");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={save} className={compact ? "space-y-3" : "rounded-lg border bg-white p-4 shadow-sm"}>
      {!compact && (
        <div>
          <h2 className="text-sm font-semibold">Agent 信息</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            给这个设备补充可读名称、职责和能力，便于团队按 Agent 分工。
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Agent 名称
          <input
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            placeholder={placeholderName}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            maxLength={128}
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Agent 类型
          <select
            value={agentType}
            onChange={(event) => setAgentType(event.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            {agentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs font-medium text-muted-foreground">
        职责说明
        <textarea
          value={agentRole}
          onChange={(event) => setAgentRole(event.target.value)}
          placeholder="例如：负责前端实现、回归验证、冲突协调"
          className="mt-1 min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          maxLength={500}
        />
      </label>

      <label className="block text-xs font-medium text-muted-foreground">
        能力标签
        <input
          value={capabilitiesText}
          onChange={(event) => setCapabilitiesText(event.target.value)}
          placeholder="例如 React, API, E2E, Review"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs">
          {message && <span className="text-emerald-700">{message}</span>}
          {error && <span className="text-destructive">{error}</span>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
        >
          保存 Agent
        </button>
      </div>
    </form>
  );
}

function parseCapabilities(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value.split(/[,，\n]/)) {
    const trimmed = raw.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result.slice(0, 20);
}
