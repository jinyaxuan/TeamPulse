"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/utils";

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
    const res = await fetch(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke user '${name}'? They'll be logged out everywhere and their devices disabled.`))
      return;
    setError(null);
    const res = await fetch(`/api/v1/admin/users/${id}/revoke`, { method: "POST" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
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
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Devices</th>
              <th className="px-4 py-2 text-left">Tasks</th>
              <th className="px-4 py-2 text-left">Joined</th>
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
                      revoked
                    </span>
                  ) : u.role === "admin" ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      admin
                    </span>
                  ) : (
                    <span className="text-muted-foreground">member</span>
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
                          Demote
                        </button>
                      ) : (
                        <button
                          onClick={() => setRole(u.id, "admin")}
                          disabled={pending}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                        >
                          Make admin
                        </button>
                      )}
                      <button
                        onClick={() => revoke(u.id, u.name)}
                        disabled={pending}
                        className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Revoke
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
