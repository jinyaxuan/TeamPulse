"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-link";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { withBasePath } from "@/lib/base-path";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

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
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const createBusy = pending || submitting;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredInvites =
    normalizedQuery.length === 0
      ? inviteCodes
      : inviteCodes.filter((invite) =>
          [
            invite.label ?? "未备注邀请码",
            inviteStatusText(invite),
            `${invite.uses}/${invite.max_uses}`,
            invite.expires_at ? formatDateTime(invite.expires_at) : "不过期",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        );

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedCode(null);
    setSubmitting(true);

    try {
      const res = await fetch(withBasePath("/api/v1/admin/invite-codes"), {
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
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(id: string) {
    if (!confirm("确定撤销这个邀请码吗？撤销后无法再用于注册。")) return;

    setError(null);
    setRevokingId(id);
    try {
      const res = await fetch(withBasePath(`/api/v1/admin/invite-codes/${id}/revoke`), { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "撤销邀请码失败");
        return;
      }

      startTransition(() => router.refresh());
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Panel
      title="邀请注册"
      description="邀请码明文只在创建后显示一次，数据库只保存哈希。"
      className="h-fit"
      actions={
        <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-black/[0.04]">
          <span>当前</span>
          <span className="font-mono font-semibold text-foreground">{filteredInvites.length}</span>
        </div>
      }
    >
      {createdCode && (
        <div className="mb-4 rounded-[20px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="text-xs font-medium text-emerald-700">新邀请码</div>
          <div className="mt-1 break-all font-mono text-lg font-semibold">{createdCode}</div>
          <div className="mt-1 text-xs text-emerald-700">请现在发给成员，刷新后不会再次显示。</div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-[20px] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={createInvite} className="grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">备注</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="例如 前端同学"
            className="tp-input"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">可使用</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(event) => setMaxUses(Number(event.target.value))}
              className="tp-input"
              aria-label="可使用次数"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">过期时间</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="tp-input"
              aria-label="过期时间"
            />
          </label>
        </div>
        <ActionButton type="submit" disabled={createBusy} pending={createBusy} variant="primary" className="w-full">
          {createBusy ? "创建中" : "创建邀请码"}
        </ActionButton>
      </form>

      <label className="mt-5 block">
        <span className="sr-only">搜索邀请码</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索备注、状态或使用次数"
          className="tp-input w-full"
        />
      </label>

      <div key={normalizedQuery} className="tp-reveal-list mt-3 max-h-[72vh] space-y-2 overflow-y-auto pr-1">
        {inviteCodes.length === 0 ? (
          <EmptyPanel>还没有邀请码。</EmptyPanel>
        ) : filteredInvites.length === 0 ? (
          <EmptyPanel>没有匹配的邀请码。</EmptyPanel>
        ) : (
          filteredInvites.map((invite) => (
            <div key={invite.id} className="tp-list-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{invite.label ?? "未备注邀请码"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    创建 {formatRelativeTime(invite.created_at)} · {invite.expires_at ? `过期 ${formatDateTime(invite.expires_at)}` : "不过期"}
                  </div>
                </div>
                {inviteStatus(invite)}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className={cn("h-full rounded-full", invite.uses >= invite.max_uses ? "bg-muted-foreground" : "bg-agent")}
                    style={{ width: `${Math.min((invite.uses / invite.max_uses) * 100, 100)}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-muted-foreground">{invite.uses}/{invite.max_uses}</span>
                {!invite.revoked_at && invite.uses < invite.max_uses && (
                  <button
                    type="button"
                    onClick={() => revokeInvite(invite.id)}
                    disabled={pending || revokingId !== null}
                    className={"rounded-full border border-red-200 bg-white/80 px-2.5 py-1 text-xs text-red-700 transition hover:bg-red-50 disabled:opacity-50 " + (revokingId === invite.id ? "tp-pending" : "")}
                  >
                    {revokingId === invite.id ? "撤销中" : "撤销"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function inviteStatus(invite: InviteCodeRow) {
  const label = inviteStatusText(invite);
  if (label === "已撤销") {
    return <StatusBadge tone="risk">{label}</StatusBadge>;
  }
  if (label === "可使用") {
    return <StatusBadge tone="online">{label}</StatusBadge>;
  }
  return <StatusBadge>{label}</StatusBadge>;
}

function inviteStatusText(invite: InviteCodeRow) {
  const expired = invite.expires_at ? new Date(invite.expires_at).getTime() <= Date.now() : false;
  const usedUp = invite.uses >= invite.max_uses;

  if (invite.revoked_at) return "已撤销";
  if (expired) return "已过期";
  if (usedUp) return "已用完";
  return "可使用";
}
