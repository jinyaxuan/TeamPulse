import Link from "next/link";

const faqs = [
  {
    q: "什么是 TeamPulse？",
    a: "TeamPulse 是一个 AI Agent 团队协调平台。当你的团队有多个 Claude Code、Codex 或其他 AI 编码助手同时工作时，TeamPulse 帮助它们知道彼此在做什么，自动避免文件冲突和重复劳动。",
  },
  {
    q: "如何接入 Claude Code？",
    a: `1. 在 TeamPulse 注册并登录\n2. 进入「设置 → 我的接入」页面\n3. 选择「Claude Code」标签\n4. 按照页面上的指引安装 TeamPulse 插件\n5. 插件安装后会自动注册设备并生成一个接入码（如 AB-CD-EF）\n6. 在「我的接入」页面输入接入码完成绑定\n7. 开始使用 Claude Code，任务会自动同步到 TeamPulse`,
  },
  {
    q: "如何接入 Codex？",
    a: `1. 进入「设置 → 我的接入」页面\n2. 选择「Codex」标签\n3. 按照指引安装 teampulse-codex 包\n4. 运行注册命令获取接入码\n5. 在页面输入接入码完成绑定`,
  },
  {
    q: "如何接入通用 Agent？",
    a: `1. 进入「设置 → 我的接入」页面\n2. 选择「通用 Agent」标签\n3. 下载 teampulse-connect.mjs 脚本\n4. 在你的 Agent 环境中运行脚本\n5. 脚本会自动注册设备并输出接入码\n6. 在页面输入接入码完成绑定`,
  },
  {
    q: "任务追踪如何工作？",
    a: "当你在 Claude Code 或 Codex 中开始一次编码任务时，TeamPulse 插件会自动上报任务信息（意图描述、分支、涉及文件等）。插件每隔几分钟发送心跳确认任务仍在进行。任务结束时，插件上报完成状态和交接摘要。整个过程对用户完全透明，无需手动操作。",
  },
  {
    q: "记忆同步如何工作？",
    a: "TeamPulse 支持将每个项目的 MEMORY.md 文件在团队成员间同步。当你的 Agent 会话开始时，插件会自动拉取最新的共享记忆；会话结束时，插件会推送更新。使用 Last-Write-Wins 策略处理冲突，确保团队共享最新的项目上下文。",
  },
  {
    q: "冲突检测如何工作？",
    a: "当两个或更多 Agent 同时在同一项目的相同文件上工作时，TeamPulse 会自动检测到文件重叠。系统会通过 SSE 实时推送预警通知，让相关 Agent 可以协调处理——选择暂停、继续但谨慎操作，或由一方让步。",
  },
  {
    q: "如何升级套餐？",
    a: `进入「设置 → 订阅计费」页面，选择需要的时长（1/3/6/12 个月），点击升级按钮。系统会跳转到支付页面，支持微信支付和支付宝。支付成功后订阅立即生效。`,
  },
  {
    q: "免费版和专业版有什么区别？",
    a: "免费版支持最多 2 名成员、3 个项目、每人 1 台设备，包含基础的任务追踪、实时感知和记忆同步。专业版支持最多 10 名成员、无限项目、每人 3 台设备，额外包含冲突检测、消息线程、活动导出和优先支持。",
  },
  {
    q: "如何取消订阅？",
    a: "进入「设置 → 订阅计费」页面，点击底部的「取消订阅」链接。取消后，你的订阅将在当前付费周期结束后降级到免费版。在此之前你仍可以使用所有专业版功能。",
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs text-white">
              TP
            </span>
            <span>TeamPulse</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">
              {"定价"}
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              {"登录"}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900">{"帮助中心"}</h1>
        <p className="mt-2 text-muted-foreground">
          {"常见问题和使用指南，帮助你快速上手 TeamPulse。"}
        </p>

        <div className="mt-10 space-y-4">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-lg border bg-white shadow-sm"
            >
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-medium text-slate-900 hover:bg-slate-50">
                {faq.q}
                <span className="ml-4 text-muted-foreground transition group-open:rotate-180">
                  {"▼"}
                </span>
              </summary>
              <div className="border-t px-6 py-4 text-sm leading-7 text-muted-foreground whitespace-pre-line">
                {faq.a}
              </div>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-lg border bg-slate-50 p-6 text-center">
          <h2 className="font-semibold text-slate-900">{"还有问题？"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {"发送邮件到 "}
            <a href="mailto:support@tangchaolizi.com" className="text-primary hover:underline">
              support@tangchaolizi.com
            </a>
            {"，我们会尽快回复。"}
          </p>
        </div>
      </main>

      <footer className="border-t bg-slate-50 px-6 py-6 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4">
          <Link href="/pricing" className="hover:text-foreground">{"定价"}</Link>
          <Link href="/help" className="hover:text-foreground">{"帮助"}</Link>
          <Link href="/login" className="hover:text-foreground">{"登录"}</Link>
        </div>
      </footer>
    </div>
  );
}
