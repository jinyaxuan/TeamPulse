"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AgentMetadataForm } from "@/components/agent-metadata-form";
import { agentDisplayName, agentTypeLabel } from "@/lib/agent-display";
import { withBasePath } from "@/lib/base-path";
import { formatRelativeTime } from "@/lib/utils";

export type PendingDevice = {
  id: string;
  claim_code: string | null;
  hostname: string | null;
  os: string | null;
  git_email: string | null;
  agent_name: string | null;
  agent_type: string | null;
  agent_role: string | null;
  capabilities: string[];
  registered_at: Date | null;
};

export type ActiveDevice = {
  id: string;
  hostname: string | null;
  os: string | null;
  agent_name: string | null;
  agent_type: string | null;
  agent_role: string | null;
  capabilities: string[];
  last_used_at: Date | null;
  approved_at: Date | null;
  user_id: string;
  user_name: string;
  user_display_name: string | null;
};

type ExistingUser = { name: string; display_name: string | null };

export function DevicesClient({
  pending,
  active,
  existingUsers,
}: {
  pending: PendingDevice[];
  active: ActiveDevice[];
  existingUsers: ExistingUser[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function approve(deviceId: string, userName: string) {
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/admin/devices/${deviceId}/approve`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "绑定失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function revoke(deviceId: string) {
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/admin/devices/${deviceId}/revoke`), {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "撤销失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          待认领 ({pending.length})
        </h2>
        <div className="mt-3 space-y-3">
          {pending.length === 0 && (
            <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
              暂无待认领设备。成员安装或运行 Agent 接入命令后，会自动出现在这里。
            </p>
          )}
          {pending.map((d) => (
            <PendingCard
              key={d.id}
              device={d}
              existingUsers={existingUsers}
              onApprove={approve}
              onReject={revoke}
              disabled={isPending}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          已启用设备 ({active.length})
        </h2>
        <div className="mt-3 overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">用户</th>
                <th className="px-4 py-2 text-left">职责</th>
                <th className="px-4 py-2 text-left">最近使用</th>
                <th className="px-4 py-2 text-left">绑定时间</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    暂无已启用设备。
                  </td>
                </tr>
              )}
              {active.map((d) => (
                <tr key={d.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{agentDisplayName(d)}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {agentTypeLabel(d.agent_type)} · {d.hostname ?? "未知主机"}
                      {d.os && ` · ${d.os}`}
                    </div>
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
                  <td className="px-4 py-2">
                    {d.user_display_name ?? d.user_name}{" "}
                    <span className="text-xs text-muted-foreground">@{d.user_name}</span>
                  </td>
                  <td className="max-w-xs px-4 py-2 text-muted-foreground">
                    {d.agent_role ? <span className="line-clamp-2">{d.agent_role}</span> : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {d.last_used_at ? formatRelativeTime(d.last_used_at) : "暂无"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {d.approved_at ? formatRelativeTime(d.approved_at) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
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
                        disabled={isPending}
                        className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        撤销
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PendingCard({
  device,
  existingUsers,
  onApprove,
  onReject,
  disabled,
}: {
  device: PendingDevice;
  existingUsers: ExistingUser[];
  onApprove: (deviceId: string, userName: string) => void;
  onReject: (deviceId: string) => void;
  disabled: boolean;
}) {
  // Suggest a user name based on git_email local-part, if available.
  const defaultName = device.git_email ? device.git_email.split("@")[0] : "";
  const [name, setName] = useState(defaultName);
  const listId = `users-${device.id}`;

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="font-mono text-sm font-semibold">{device.claim_code ?? "—"}</div>
          <div className="text-sm">
            <span className="font-medium">{agentDisplayName(device)}</span>
            {device.os && <span className="text-muted-foreground"> · {device.os}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {agentTypeLabel(device.agent_type)}
            {device.hostname && ` · ${device.hostname}`}
          </div>
          {device.git_email && (
            <div className="text-xs text-muted-foreground">Git 邮箱：{device.git_email}</div>
          )}
          <div className="text-xs text-muted-foreground">
            注册于 {device.registered_at ? formatRelativeTime(device.registered_at) : "未知时间"}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-xs font-medium text-muted-foreground">
            认领为用户
          </label>
          <input
            type="text"
            list={listId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 alice"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <datalist id={listId}>
            {existingUsers.map((u) => (
              <option key={u.name} value={u.name}>
                {u.display_name ?? u.name}
              </option>
            ))}
          </datalist>
        </div>
        <button
          onClick={() => {
            if (!name.trim()) return;
            onApprove(device.id, name.trim());
          }}
          disabled={disabled || !name.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          绑定到用户
        </button>
        <button
          onClick={() => onReject(device.id)}
          disabled={disabled}
          className="rounded-md border px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          拒绝
        </button>
      </div>
    </div>
  );
}
