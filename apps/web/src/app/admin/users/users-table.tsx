"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-link";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { withBasePath } from "@/lib/base-path";
import { formatRelativeTime, roleLabel } from "@/lib/utils";

export type UserRow = {
  id: string;
  name: string;
  display_name: string | null;
  email: string | null;
  role: string;
  created_at: Date;
  revoked_at: Date | null;
  device_count: number;
  task_count: number;
};

export function UsersTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers =
    normalizedQuery.length === 0
      ? users
      : users.filter((u) =>
          [
            u.name,
            u.display_name ?? "",
            u.email ?? "",
            roleLabel(u.role),
            u.revoked_at ? "已撤销" : "可登录",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        );

  async function setRole(id: string, role: "admin" | "member") {
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/admin/users/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "操作失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`确定撤销用户「${name}」吗？该用户会被强制退出，所有设备也会被禁用。`))
      return;
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/admin/users/${id}/revoke`), { method: "POST" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "操作失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Panel
      title={`成员账号 (${users.length})`}
      description="角色、设备和任务贡献按账号汇总。"
      bodyClassName="p-3 sm:p-4"
      actions={
        <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-black/[0.04]">
          <span>当前</span>
          <span className="font-mono font-semibold text-foreground">{filteredUsers.length}</span>
        </div>
      }
    >
      {error && (
        <div className="mb-3 rounded-[20px] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <label className="mb-3 block">
        <span className="sr-only">搜索成员账号</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索成员、邮箱、角色或状态"
          className="tp-input w-full"
        />
      </label>
      <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
        {users.length === 0 ? (
          <EmptyPanel>还没有成员账号。</EmptyPanel>
        ) : filteredUsers.length === 0 ? (
          <EmptyPanel>没有匹配的成员账号。</EmptyPanel>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className="tp-list-card p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto] lg:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                    {(u.display_name ?? u.name).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{u.display_name ?? u.name}</span>
                      {u.revoked_at ? (
                        <StatusBadge tone="risk">已撤销</StatusBadge>
                      ) : u.role === "admin" ? (
                        <StatusBadge tone="info">{roleLabel(u.role)}</StatusBadge>
                      ) : (
                        <StatusBadge>{roleLabel(u.role)}</StatusBadge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>@{u.name}</span>
                      <span>{u.email ?? "未设置邮箱"}</span>
                      <span>加入 {formatRelativeTime(u.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <StatPill label="设备" value={u.device_count} />
                  <StatPill label="任务" value={u.task_count} />
                </div>

                <div className="text-xs text-muted-foreground">
                  {u.revoked_at ? `撤销 ${formatRelativeTime(u.revoked_at)}` : "账号可正常登录"}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {!u.revoked_at && (
                    <>
                      {u.role === "admin" ? (
                        <ActionButton
                          type="button"
                          onClick={() => setRole(u.id, "member")}
                          disabled={pending}
                          className="px-3 py-1.5 text-xs"
                        >
                          设为成员
                        </ActionButton>
                      ) : (
                        <ActionButton
                          type="button"
                          onClick={() => setRole(u.id, "admin")}
                          disabled={pending}
                          className="px-3 py-1.5 text-xs"
                        >
                          设为管理员
                        </ActionButton>
                      )}
                      <ActionButton
                        type="button"
                        onClick={() => revoke(u.id, u.name)}
                        disabled={pending}
                        variant="danger"
                        className="px-3 py-1.5 text-xs"
                      >
                        撤销
                      </ActionButton>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full bg-white/70 px-3 py-2 ring-1 ring-black/[0.04]">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-2 font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}
