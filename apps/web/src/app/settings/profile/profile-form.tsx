"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { roleLabel } from "@/lib/utils";

type Current = {
  name: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  has_password: boolean;
};

export function ProfileForm({ current }: { current: Current }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(current.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(current.avatar_url ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const body: Record<string, string> = {};
    if (displayName !== (current.display_name ?? "")) body.display_name = displayName;
    if (avatarUrl !== (current.avatar_url ?? "")) body.avatar_url = avatarUrl;
    if (newPassword) {
      body.new_password = newPassword;
      body.current_password = currentPassword;
    }
    if (Object.keys(body).length === 0) {
      setMessage({ type: "ok", text: "没有需要保存的改动。" });
      return;
    }

    const res = await fetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      setMessage({ type: "err", text: errBody.error ?? "保存失败" });
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setMessage({ type: "ok", text: "已保存。" });
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <ReadOnlyField label="用户名" value={current.name} hint="设备审批时设置，当前不可修改" />
      {current.email && <ReadOnlyField label="邮箱" value={current.email} />}
      <ReadOnlyField label="角色" value={roleLabel(current.role)} />

      <div>
        <label className="block text-sm font-medium">显示名称</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={128}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">头像 URL</label>
        <input
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {current.has_password && (
        <fieldset className="rounded-md border p-4">
          <legend className="px-2 text-xs font-medium uppercase text-muted-foreground">
            修改密码
          </legend>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium">当前密码</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </fieldset>
      )}

      {message && (
        <p
          className={
            "text-sm " + (message.type === "ok" ? "text-green-600" : "text-destructive")
          }
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "保存中…" : "保存改动"}
      </button>
    </form>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
