"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import { formatRelativeTime } from "@/lib/utils";

export type ProjectMemberRow = {
  user_id: string;
  user_name: string;
  user_display_name: string | null;
  role: string;
  source: string;
  joined_at: Date | string;
  last_seen_at: Date | string;
};

const projectRoles = [
  { value: "owner", label: "Owner" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
] as const;

export function ProjectMembersPanel({
  projectId,
  members,
  canManage,
  currentUserId,
}: {
  projectId: string;
  members: ProjectMemberRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [user, setUser] = useState("");
  const [role, setRole] = useState<(typeof projectRoles)[number]["value"]>("member");
  const [error, setError] = useState<string | null>(null);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user.trim()) return;
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/projects/${projectId}/members`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, role }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "添加成员失败");
      return;
    }
    setUser("");
    setRole("member");
    startTransition(() => router.refresh());
  }

  async function updateRole(userId: string, nextRole: string) {
    setError(null);
    const res = await fetch(withBasePath(`/api/v1/projects/${projectId}/members/${userId}`), {
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

  async function removeMember(member: ProjectMemberRow) {
    const name = member.user_display_name ?? member.user_name;
    if (!confirm(`确定从项目中移除「${name}」吗？该成员将无法继续查看这个项目。`)) return;

    setError(null);
    const res = await fetch(withBasePath(`/api/v1/projects/${projectId}/members/${member.user_id}`), {
      method: "DELETE",
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "移除成员失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">项目成员</h2>
          {canManage && (
            <p className="mt-1 text-xs text-muted-foreground">
              Owner 可以管理成员；Member 可以上报任务；Viewer 只读。
            </p>
          )}
        </div>
        {canManage && (
          <form onSubmit={addMember} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={user}
              onChange={(event) => setUser(event.target.value)}
              placeholder="用户名或邮箱"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-48"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as typeof role)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {projectRoles.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending || !user.trim()}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
            >
              添加成员
            </button>
          </form>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {members.length === 0 && (
          <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
            还没有成员记录。成员在该仓库启动任务后会自动加入。
          </div>
        )}
        {members.map((member) => (
          <div key={member.user_id} className="rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {member.user_display_name ?? member.user_name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">@{member.user_name}</div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {projectMemberSourceLabel(member.source)}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="text-xs text-muted-foreground">
                最近确认 {formatRelativeTime(member.last_seen_at)}
              </div>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    onChange={(event) => updateRole(member.user_id, event.target.value)}
                    disabled={pending}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
                    aria-label={`${member.user_name} 的项目角色`}
                  >
                    {projectRoles.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeMember(member)}
                    disabled={pending || member.user_id === currentUserId}
                    className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    移除
                  </button>
                </div>
              ) : (
                <span className="w-fit rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {projectMemberRoleLabel(member.role)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function projectMemberSourceLabel(source: string): string {
  if (source === "activity") return "任务加入";
  if (source === "resolve") return "仓库加入";
  if (source === "manual") return "手动加入";
  return "成员";
}

function projectMemberRoleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "viewer") return "Viewer";
  return "Member";
}
