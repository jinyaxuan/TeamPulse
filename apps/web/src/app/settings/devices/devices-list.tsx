"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/utils";

type MyDevice = {
  id: string;
  hostname: string | null;
  os: string | null;
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
    if (!confirm("Revoke this device? The Claude Code plugin on it will need to re-register.")) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/v1/devices/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Revoke failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        No devices yet. When you install the Claude Code plugin, it registers a device here.
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
              <th className="px-4 py-2 text-left">Host</th>
              <th className="px-4 py-2 text-left">OS</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Last seen</th>
              <th className="px-4 py-2 text-left">Approved</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b last:border-b-0">
                <td className="px-4 py-2 font-mono text-xs">{d.hostname ?? "(unknown)"}</td>
                <td className="px-4 py-2 text-muted-foreground">{d.os ?? "—"}</td>
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
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {d.last_used_at ? formatRelativeTime(d.last_used_at) : "never"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {d.approved_at ? formatRelativeTime(d.approved_at) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {d.status === "active" && (
                    <button
                      onClick={() => revoke(d.id)}
                      disabled={pending}
                      className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Revoke
                    </button>
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
