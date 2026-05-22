"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AgentMetadataForm } from "@/components/agent-metadata-form";
import { agentDisplayName, agentTypeLabel } from "@/lib/agent-display";
import { withBasePath } from "@/lib/base-path";
import { deviceStatusLabel, formatRelativeTime } from "@/lib/utils";

type MyDevice = {
  id: string;
  hostname: string | null;
  os: string | null;
  git_email: string | null;
  agent_name: string | null;
  agent_type: string | null;
  agent_role: string | null;
  capabilities: string[];
  status: string;
  registered_at: Date | null;
  approved_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

export function DevicesList({ devices }: { devices: MyDevice[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    if (!confirm("确定撤销这个设备吗？该设备上的插件需要重新注册后才能继续使用。")) {
      return;
    }
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/devices/${id}`), { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "撤销失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        暂无设备。安装 Claude Code 或 Codex 插件后，设备会注册到这里。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Agent</th>
              <th className="px-4 py-2 text-left">职责</th>
              <th className="px-4 py-2 text-left">状态</th>
              <th className="px-4 py-2 text-left">最近使用</th>
              <th className="px-4 py-2 text-left">审批时间</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <div className="text-sm font-medium">{agentDisplayName(d)}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {agentTypeLabel(d.agent_type)} · {d.hostname ?? "未知主机"}
                    {d.os && ` · ${d.os}`}
                  </div>
                  {d.git_email && (
                    <div className="mt-1 text-xs text-muted-foreground">Git 邮箱：{d.git_email}</div>
                  )}
                  {d.capabilities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.capabilities.map((capability) => (
                        <span key={capability} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {capability}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="max-w-xs px-4 py-2 text-muted-foreground">
                  {d.agent_role ? <span className="line-clamp-2">{d.agent_role}</span> : "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (d.status === "active"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : d.status === "pending"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {deviceStatusLabel(d.status)}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {d.last_used_at ? formatRelativeTime(d.last_used_at) : "暂无"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {d.approved_at ? formatRelativeTime(d.approved_at) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {d.status === "active" && (
                    <div className="flex items-center justify-end gap-2">
                      <details className="text-left">
                        <summary className="cursor-pointer rounded-md border px-2 py-1 text-xs hover:bg-slate-50">
                          编辑
                        </summary>
                        <div className="absolute right-6 z-10 mt-2 w-[min(28rem,calc(100vw-3rem))] rounded-lg border bg-white p-4 text-left shadow-lg">
                          <AgentMetadataForm device={d} compact />
                        </div>
                      </details>
                      <button
                        onClick={() => revoke(d.id)}
                        disabled={pending}
                        className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        撤销
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
