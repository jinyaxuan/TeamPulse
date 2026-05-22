"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AgentMetadataForm } from "@/components/agent-metadata-form";
import { ActionButton } from "@/components/ui/action-link";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
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
  git_email: string | null;
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
  const [activeQuery, setActiveQuery] = useState("");
  const normalizedActiveQuery = activeQuery.trim().toLowerCase();
  const filteredActive =
    normalizedActiveQuery.length === 0
      ? active
      : active.filter((device) =>
          [
            agentDisplayName(device),
            agentTypeLabel(device.agent_type),
            device.hostname ?? "",
            device.os ?? "",
            device.git_email ?? "",
            device.agent_role ?? "",
            device.user_name,
            device.user_display_name ?? "",
            ...device.capabilities,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedActiveQuery)
        );

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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      {error && (
        <div className="xl:col-span-2 rounded-[20px] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Panel title={`待认领 (${pending.length})`} description="新安装的 Agent 会先停在这里，确认身份后绑定成员。">
        <div className="space-y-3">
          {pending.length === 0 && (
            <EmptyPanel>暂无待认领设备。成员安装或运行 Agent 接入命令后，会自动出现在这里。</EmptyPanel>
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
      </Panel>

      <Panel
        title={`已启用设备 (${active.length})`}
        description="按最近使用排序，展示成员、职责和能力。"
        actions={
          <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-black/[0.04]">
            <span>当前</span>
            <span className="font-mono font-semibold text-foreground">{filteredActive.length}</span>
          </div>
        }
      >
        <label className="mb-3 block">
          <span className="sr-only">搜索已启用设备</span>
          <input
            value={activeQuery}
            onChange={(event) => setActiveQuery(event.target.value)}
            placeholder="搜索 Agent、成员、主机、邮箱或能力"
            className="tp-input w-full"
          />
        </label>
        <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
          {active.length === 0 ? (
            <EmptyPanel>暂无已启用设备。</EmptyPanel>
          ) : filteredActive.length === 0 ? (
            <EmptyPanel>没有匹配的已启用设备。</EmptyPanel>
          ) : (
            filteredActive.map((d) => (
              <div key={d.id} className="tp-list-card p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{agentDisplayName(d)}</span>
                      <StatusBadge tone="agent">{agentTypeLabel(d.agent_type)}</StatusBadge>
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {d.hostname ?? "未知主机"}{d.os ? ` · ${d.os}` : ""}
                    </div>
                    {d.git_email && (
                      <div className="mt-1 text-xs text-muted-foreground">Git 邮箱：{d.git_email}</div>
                    )}
                    {d.agent_role && (
                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{d.agent_role}</div>
                    )}
                    {d.capabilities.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {d.capabilities.map((capability) => (
                          <span key={capability} className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-black/[0.04]">
                            {capability}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">{d.user_display_name ?? d.user_name}</div>
                    <div>@{d.user_name}</div>
                    <div className="mt-2">最近使用 {d.last_used_at ? formatRelativeTime(d.last_used_at) : "暂无"}</div>
                    <div>绑定 {d.approved_at ? formatRelativeTime(d.approved_at) : "—"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <details className="text-left">
                      <summary className="cursor-pointer rounded-full border border-black/10 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white">
                        编辑
                      </summary>
                      <div className="absolute right-6 z-10 mt-2 w-[min(28rem,calc(100vw-3rem))] rounded-[22px] border border-black/10 bg-white p-4 text-left shadow-[0_24px_70px_-38px_rgba(0,0,0,0.42)]">
                        <AgentMetadataForm device={d} compact />
                      </div>
                    </details>
                    <ActionButton
                      type="button"
                      onClick={() => revoke(d.id)}
                      disabled={isPending}
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                    >
                      撤销
                    </ActionButton>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
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
    <div className="tp-list-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-mono text-sm font-semibold">{device.claim_code ?? "—"}</div>
            <StatusBadge tone="warning">待认领</StatusBadge>
          </div>
          <div className="text-sm font-medium">
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
            className="tp-input mt-1 w-full"
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
          className="rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:bg-black/80 disabled:opacity-50"
        >
          绑定到用户
        </button>
        <button
          onClick={() => onReject(device.id)}
          disabled={disabled}
          className="rounded-full border border-red-200 bg-white/80 px-4 py-2.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
        >
          拒绝
        </button>
      </div>
    </div>
  );
}
