import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diffSec = Math.round((now - d.getTime()) / 1000);

  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} 天前`;
  return d.toLocaleDateString("zh-CN");
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "进行中";
    case "done":
      return "已完成";
    case "abandoned":
      return "已中断";
    default:
      return status;
  }
}

export function deviceStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "已启用";
    case "pending":
      return "待审批";
    case "revoked":
      return "已撤销";
    case "rejected":
      return "已拒绝";
    default:
      return status;
  }
}

export function roleLabel(role: string): string {
  return role === "admin" ? "管理员" : "成员";
}

export function clientLabel(client: string): string {
  switch (client) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    default:
      return client;
  }
}
