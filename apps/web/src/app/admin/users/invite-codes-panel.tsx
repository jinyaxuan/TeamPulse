"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";

export type InviteCodeRow = {
  id: string;
  label: string | null;
  max_uses: number;
  uses: number;
  created_at: Date;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

export function InviteCodesPanel({ inviteCodes }: { inviteCodes: InviteCodeRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedCode(null);

    const res = await fetch("/api/v1/admin/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label || undefined,
        max_uses: maxUses,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "创建邀请码失败");
      return;
    }

    setCreatedCode(body.invite_code?.code ?? null);
    setLabel("");
    setMaxUses(1);
    setExpiresAt("");
    startTransition(() => router.refresh());
  }

  async function revokeInvite(id: string) {
    if (!confirm("确定撤销这个邀请码吗？撤销后无法再用于注册。")) return;

    setError(null);
    const res = await fetch(`/api/v1/admin/invite-codes/${id}/revoke`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "撤销邀请码失败");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold">邀请注册</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          只允许通过邀请码创建成员账号。邀请码明文只在创建后显示一次，数据库只保存哈希。
        </p>
      </div>

      {createdCode && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          新邀请码：<span className="font-mono font-semibold">{createdCode}</span>
          <span className="ml-2 text-emerald-700">请现在发给成员，刷新后不会再次显示。</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={createInvite} className="grid gap-3 md:grid-cols-[1fr_120px_190px_auto]">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="备注，例如 前端同学"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={1}
          max={1000}
          value={maxUses}
          onChange={(event) => setMaxUses(Number(event.target.value))}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="可使用次数"
        />
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="过期时间"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          创建邀请码
        </button>
      </form>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">备注</th>
              <th className="px-4 py-2 text-left">使用</th>
              <th className="px-4 py-2 text-left">状态</th>
              <th className="px-4 py-2 text-left">创建</th>
              <th className="px-4 py-2 text-left">过期</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {inviteCodes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  还没有邀请码
                </td>
              </tr>
            ) : (
              inviteCodes.map((invite) => (
                <tr key={invite.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2">{invite.label ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {invite.uses} / {invite.max_uses}
                  </td>
                  <td className="px-4 py-2">{inviteStatus(invite)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatRelativeTime(invite.created_at)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {invite.expires_at ? formatDateTime(invite.expires_at) : "不过期"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!invite.revoked_at && invite.uses < invite.max_uses && (
                      <button
                        onClick={() => revokeInvite(invite.id)}
                        disabled={pending}
                        className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        撤销
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function inviteStatus(invite: InviteCodeRow) {
  const expired = invite.expires_at ? new Date(invite.expires_at).getTime() <= Date.now() : false;
  const usedUp = invite.uses >= invite.max_uses;

  if (invite.revoked_at) {
    return (
      <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
        已撤销
      </span>
    );
  }
  if (expired) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
        已过期
      </span>
    );
  }
  if (usedUp) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
        已用完
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
      可使用
    </span>
  );
}
