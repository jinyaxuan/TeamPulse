"use client";

import { useMemo, useState } from "react";

type TabKey = "skill" | "codex" | "claude" | "openclaw";

type TabConfig = {
  key: TabKey;
  title: string;
  badge: string;
  description: string;
};

const TABS: TabConfig[] = [
  {
    key: "skill",
    title: "Agent Skill",
    badge: "推荐",
    description: "复制一句话给 Agent，由 Agent 自动完成接入。",
  },
  {
    key: "codex",
    title: "Codex",
    badge: "直接发给 Codex",
    description: "普通 Codex 用户不需要 TeamPulse 项目源码，只需要让 Codex 执行接入指令。",
  },
  {
    key: "claude",
    title: "Claude Code",
    badge: "直接发给 Claude",
    description: "Claude Code 也走同一套 Agent Skill 流程；账号归属仍由本页绑定决定。",
  },
  {
    key: "openclaw",
    title: "OpenClaw / Skillhub",
    badge: "Skill 分发",
    description: "发布到 Skillhub 后，让 OpenClaw 按指令完成接入，不暴露 TeamPulse 源码。",
  },
];

export function AgentConnectTabs({ appUrl }: { appUrl: string }) {
  const [active, setActive] = useState<TabKey>("skill");
  const prompts = useMemo(() => buildPrompts(appUrl), [appUrl]);
  const activeTab = TABS.find((tab) => tab.key === active) ?? TABS[0];

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">选择 Agent</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            页面只提供给 Agent 的完整指令；人不用逐条执行终端命令。
          </p>
        </div>
        <div className="flex overflow-x-auto rounded-md border bg-slate-50 p-1" role="tablist" aria-label="Agent 接入方式">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active === tab.key}
              onClick={() => setActive(tab.key)}
              className={
                "whitespace-nowrap rounded px-3 py-1.5 text-sm transition " +
                (active === tab.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-white hover:text-foreground")
              }
            >
              {tab.title}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{activeTab.title}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {activeTab.badge}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{activeTab.description}</p>

        <PromptBlock title="复制给 Agent 的一句话" text={prompts[active]} />

        <div className="mt-4 rounded-md border bg-slate-50 p-3 text-xs leading-5 text-muted-foreground">
          Agent 会返回一个 <span className="font-mono text-foreground">claim_code</span>。你只需要把它填到下面的绑定框；
          绑定完成后告诉 Agent 继续，它会自动写入本机凭据。
        </div>
      </div>
    </section>
  );
}

function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-4 rounded-md border bg-slate-50 p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-slate-800">
        {text}
      </pre>
    </div>
  );
}

function buildPrompts(appUrl: string): Record<TabKey, string> {
  const connectorUrl = `${appUrl}/agent/teampulse-connect.mjs`;
  const basePrompt = `请根据 ${connectorUrl} 将当前机器接入 TeamPulse（${appUrl}），注册后只把 claim_code 返回给我，我绑定后你继续写入凭据并确认账号。`;

  return {
    skill: basePrompt,
    codex: `请在当前 Codex 环境中根据 ${connectorUrl} 接入 TeamPulse（${appUrl}），注册后只把 claim_code 返回给我，我绑定后你继续写入凭据并确认账号。`,
    claude: `请在当前 Claude Code 环境中根据 ${connectorUrl} 接入 TeamPulse（${appUrl}），注册后只把 claim_code 返回给我，我绑定后你继续写入凭据并确认账号。`,
    openclaw: `请根据 https://skillhub.cn/install/skillhub.md 安装 Skillhub 命令行工具并重启 Agent，然后根据 ${connectorUrl} 接入 TeamPulse（${appUrl}），注册后只把 claim_code 返回给我，我绑定后你继续写入凭据并确认账号。`,
  };
}
