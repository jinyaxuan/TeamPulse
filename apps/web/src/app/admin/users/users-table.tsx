"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
              <th className="px-4 py-2 text-left">用户</th>
              <th className="px-4 py-2 text-left">邮箱</th>
              <th className="px-4 py-2 text-left">角色</th>
              <th className="px-4 py-2 text-left">设备</th>
              <th className="px-4 py-2 text-left">任务</th>
              <th className="px-4 py-2 text-left">加入时间</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <div className="font-medium">{u.display_name ?? u.name}</div>
                  <div className="text-xs text-muted-foreground">@{u.name}</div>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{u.email ?? "—"}</td>
                <td className="px-4 py-2">
                  {u.revoked_at ? (
                    <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                      已撤销
                    </span>
                  ) : u.role === "admin" ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {roleLabel(u.role)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{roleLabel(u.role)}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{u.device_count}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.task_count}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatRelativeTime(u.created_at)}
                </td>
                <td className="px-4 py-2 text-right">
                  {!u.revoked_at && (
                    <div className="flex items-center justify-end gap-2">
                      {u.role === "admin" ? (
                        <button
                          onClick={() => setRole(u.id, "member")}
                          disabled={pending}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                        >
                          设为成员
                        </button>
                      ) : (
                        <button
                          onClick={() => setRole(u.id, "admin")}
                          disabled={pending}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                        >
                          设为管理员
                        </button>
                      )}
                      <button
                        onClick={() => revoke(u.id, u.name)}
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
