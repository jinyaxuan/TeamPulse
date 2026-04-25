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
    description: "把整段指令交给 Agent。Agent 负责安装连接器、注册设备、等待绑定、写入凭据。",
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

        <PromptBlock title="复制给 Agent 的指令" text={prompts[active]} />

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
  const basePrompt = `请使用 TeamPulse Agent Skill 接入当前机器。

要求：
- 不要要求我手工执行终端命令。
- 不要要求我拥有 TeamPulse 项目源码。
- 你负责安装或下载连接器、注册设备、暂存 device_secret、在我绑定 claim_code 后继续 poll，并写入 ~/.teampulse/credentials.json。
- token 和 device_secret 都是敏感信息，不要贴给我，除非我明确要求。

TeamPulse 服务地址：${appUrl}
连接器地址：${connectorUrl}

你需要自动完成连接器下载、register、等待我绑定、poll 写入凭据、status 校验这些动作。完成 register 后只把 claim_code 返回给我；等我确认已经在 TeamPulse “我的接入”页面绑定后，再继续写入凭据并告诉我连接到的账号。`;

  return {
    skill: basePrompt,
    codex: `请为当前 Codex 环境接入 TeamPulse。\n\n${basePrompt}`,
    claude: `请为当前 Claude Code 环境接入 TeamPulse。\n\n${basePrompt}`,
    openclaw: `请为当前 OpenClaw / Skillhub Agent 接入 TeamPulse。\n\n${basePrompt}`,
  };
}
