"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

export function MemberRoleActions({
  memberId,
  memberName,
  role,
  isSelf,
}: {
  memberId: string;
  memberName: string;
  role: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function setRole(nextRole: "admin" | "member") {
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/admin/users/${memberId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "更新角色失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function revokeMember() {
    if (!confirm(`确定撤销用户「${memberName}」吗？该用户会被强制退出，所有设备也会被禁用。`)) {
      return;
    }
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/admin/users/${memberId}/revoke`), {
      method: "POST",
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "撤销用户失败");
      return;
    }
    router.push("/team");
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold">成员管理</div>
      <div className="mt-1 text-xs text-muted-foreground">
        管理账号角色和访问状态。项目权限仍在对应项目内由 Owner 管理。
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {role === "admin" ? (
          <button
            type="button"
            onClick={() => setRole("member")}
            disabled={pending || isSelf}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            设为成员
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRole("admin")}
            disabled={pending}
            className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            设为管理员
          </button>
        )}
        <button
          type="button"
          onClick={revokeMember}
          disabled={pending || isSelf}
          className="rounded-md border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          撤销成员
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {isSelf && (
        <div className="mt-3 text-xs text-muted-foreground">
          当前登录账号不能在这里降级或撤销自己。
        </div>
      )}
    </div>
  );
}

export function RevokeDeviceButton({ deviceId, disabled }: { deviceId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function revokeDevice() {
    if (!confirm("确定撤销这个 Agent 设备吗？该设备需要重新注册后才能继续上报任务。")) {
      return;
    }
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/devices/${deviceId}`), { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "撤销设备失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={revokeDevice}
        disabled={disabled || pending}
        className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        撤销
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
