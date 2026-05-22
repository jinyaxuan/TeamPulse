"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import { formatRelativeTime } from "@/lib/utils";
import type { ProjectMemberRow } from "./project-members-panel";

export type ProjectMessageRow = {
  id: string;
  thread_key: string;
  body: string;
  task_id: string | null;
  created_at: Date | string;
  author_id: string | null;
  author_name: string | null;
  author_display_name: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  target_user_display_name: string | null;
};

export function ProjectMessagesPanel({
  projectId,
  messages,
  members,
  canSend,
}: {
  projectId: string;
  messages: ProjectMessageRow[];
  members: ProjectMemberRow[];
  canSend: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [threadKey, setThreadKey] = useState("project");
  const [targetUserId, setTargetUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function sendMessage() {
    const trimmed = body.trim();
    if (!trimmed) return;

    setError(null);
    const res = await fetch(withBasePath(`/api/v1/projects/${projectId}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: trimmed,
        thread_key: threadKey.trim() || "project",
        to_user_id: targetUserId || undefined,
      }),
    });

    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "发送失败");
      return;
    }

    setBody("");
    startTransition(() => router.refresh());
  }

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Agent 消息 ({messages.length})
          </h2>
        </div>
        {canSend && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2"
              aria-label="接收人"
            >
              <option value="">项目广播</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  @{member.user_display_name ?? member.user_name}
                </option>
              ))}
            </select>
            <input
              value={threadKey}
              onChange={(event) => setThreadKey(event.target.value)}
              className="w-36 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              aria-label="线程"
              maxLength={160}
            />
          </div>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-md border bg-card">
        <div className="divide-y">
          {messages.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">暂无消息。</div>
          )}
          {messages.map((message) => (
            <div key={message.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {message.author_display_name ?? message.author_name ?? "未知成员"}
                </span>
                {message.target_user_id && (
                  <>
                    <span>→</span>
                    <span>{message.target_user_display_name ?? message.target_user_name ?? "未知成员"}</span>
                  </>
                )}
                <span>·</span>
                <span className="font-mono">{message.thread_key}</span>
                {message.task_id && (
                  <>
                    <span>·</span>
                    <span className="font-mono">任务 {message.task_id.slice(0, 8)}</span>
                  </>
                )}
                <span>·</span>
                <span>{formatRelativeTime(message.created_at)}</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap leading-6">{message.body}</div>
            </div>
          ))}
        </div>

        {canSend && (
          <div className="border-t bg-muted/20 p-3">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
              aria-label="消息内容"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs text-red-700">{error}</div>
              <button
                type="button"
                onClick={sendMessage}
                disabled={pending || body.trim().length === 0}
                className={"rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 " + (pending ? "tp-pending" : "")}
              >
                {pending ? "发送中" : "发送"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
