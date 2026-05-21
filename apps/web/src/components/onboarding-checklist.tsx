import Link from "next/link";
import type { User } from "@/db";

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
}

export function OnboardingChecklist({
  user,
  hasDevice,
  hasTask,
}: {
  user: User;
  hasDevice: boolean;
  hasTask: boolean;
}) {
  const steps: OnboardingStep[] = [
    {
      key: "profile",
      label: "完善个人资料",
      description: "设置你的显示名称",
      href: "/settings/profile",
      completed: Boolean(user.displayName && user.displayName !== user.name),
    },
    {
      key: "device",
      label: "接入 Agent",
      description: "绑定 Claude Code、Codex 或其他 AI 编码助手",
      href: "/settings/connect",
      completed: hasDevice,
    },
    {
      key: "task",
      label: "开始第一个任务",
      description: "在你的 Agent 中启动一次编码任务",
      href: "/help",
      completed: hasTask,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-blue-900">
            {"欢迎使用 TeamPulse！"}
          </h3>
          <p className="mt-0.5 text-xs text-blue-700">
            {"完成以下步骤开始团队协作 — " + completedCount + "/" + steps.length + " 已完成"}
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-800">
          {completedCount}/{steps.length}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={
              "flex items-center gap-3 rounded-md border bg-white px-4 py-3 text-sm transition hover:bg-slate-50 " +
              (step.completed ? "border-emerald-200" : "border-slate-200")
            }
          >
            <span
              className={
                "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs " +
                (step.completed
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-slate-100 text-slate-400")
              }
            >
              {step.completed ? "\u2713" : (steps.indexOf(step) + 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className={step.completed ? "text-muted-foreground line-through" : "font-medium"}>
                {step.label}
              </div>
              <div className="text-xs text-muted-foreground">{step.description}</div>
            </div>
            {!step.completed && (
              <span className="text-xs text-primary">{"\u2192"}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
