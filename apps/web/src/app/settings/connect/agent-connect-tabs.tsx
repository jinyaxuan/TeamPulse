"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type TabKey = "skill" | "curl" | "codex" | "claude" | "openclaw";

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
    description: "正式接入用 Skill 或独立脚本完成注册、等待绑定、领取 token、写入本机凭据。",
  },
  {
    key: "curl",
    title: "curl 协议",
    badge: "底层协议",
    description: "curl 适合理解和调试协议；正式使用时建议由 Skill 封装并保存凭据。",
  },
  {
    key: "codex",
    title: "Codex",
    badge: "Skill 接入",
    description: "Codex 推荐使用 TeamPulse Agent Skill，普通用户不需要 TeamPulse 项目源码。",
  },
  {
    key: "claude",
    title: "Claude Code",
    badge: "插件接入",
    description: "Claude Code 推荐启用仓库内插件；插件内部走同一套注册和领取接口。",
  },
  {
    key: "openclaw",
    title: "OpenClaw / Skillhub",
    badge: "Skillhub",
    description: "把 TeamPulse Agent Skill 发布到 Skillhub 后，不同 Agent 都能用同一套账号认领流程。",
  },
];

export function AgentConnectTabs({ appUrl }: { appUrl: string }) {
  const [active, setActive] = useState<TabKey>("skill");
  const commands = useMemo(() => buildCommands(appUrl), [appUrl]);
  const activeTab = TABS.find((tab) => tab.key === active) ?? TABS[0];

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">选择接入方式</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Skill 负责本机落盘，curl 是底层协议；不同 Agent 只需要调用同一套接入流程。
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

        {active === "skill" && <SkillPanel commands={commands} />}
        {active === "curl" && <CurlPanel commands={commands} />}
        {active === "codex" && <CodexPanel commands={commands} />}
        {active === "claude" && <ClaudePanel commands={commands} />}
        {active === "openclaw" && <OpenClawPanel commands={commands} />}
      </div>
    </section>
  );
}

function SkillPanel({ commands }: { commands: ReturnType<typeof buildCommands> }) {
  return (
    <div className="mt-5 space-y-5">
      <Step
        index={1}
        title="安装或携带 TeamPulse Agent Skill"
        description="正式给团队成员使用时，把 packages/teampulse-agent 发布成 Skill。没有 Skill 平台时，也可以下载独立连接脚本。"
      >
        <CodeBlock command={commands.installConnector} />
      </Step>
      <Step
        index={2}
        title="注册并返回 claim_code"
        description="Agent 执行注册命令。脚本会把 device_secret 暂存到 ~/.teampulse/device.json，并只把 claim_code 返回给用户绑定。"
      >
        <CodeBlock command={commands.skillRegister} />
      </Step>
      <Step
        index={3}
        title="用户绑定后写入凭据"
        description="用户在本页绑定 claim_code 后，Agent 执行 poll。脚本会领取 token 并写入 ~/.teampulse/credentials.json。"
      >
        <CodeBlock command={commands.skillPoll} />
      </Step>
      <PromptBlock title="给 Agent 的一句话" text={commands.skillPrompt} />
    </div>
  );
}

function CurlPanel({ commands }: { commands: ReturnType<typeof buildCommands> }) {
  return (
    <div className="mt-5 space-y-5">
      <Step
        index={1}
        title="注册设备并拿到认领码"
        description="Agent 在本机执行。响应里的 claim_code 给用户绑定，device_secret 必须由 Agent 安全暂存。"
      >
        <CodeBlock command={commands.curlRegister} />
      </Step>
      <Step
        index={2}
        title="用户在页面绑定 claim_code"
        description="绑定动作必须由当前 TeamPulse 登录账号完成，这一步决定设备挂到谁名下。"
      />
      <Step
        index={3}
        title="绑定后领取 token"
        description="把上一步注册响应里的 claim_code 和 device_secret 填回环境变量，再调用领取接口。curl 只返回 token，不负责写凭据。"
      >
        <CodeBlock command={commands.curlPoll} />
      </Step>
      <Step
        index={4}
        title="由 Skill 写入凭据"
        description="拿到 token 后，不建议让用户手工编辑 JSON；正式流程应交给 Agent Skill 写入 ~/.teampulse/credentials.json。"
      />
    </div>
  );
}

function CodexPanel({ commands }: { commands: ReturnType<typeof buildCommands> }) {
  return (
    <div className="mt-5 space-y-5">
      <Step
        index={1}
        title="Codex 也走 Agent Skill"
        description="普通用户不应该依赖本项目源码里的开发命令。让 Codex 使用 TeamPulse Agent Skill 完成注册和凭据写入。"
      >
        <CodeBlock command={commands.skillRegister} />
      </Step>
      <Step
        index={2}
        title="用户绑定后写入凭据"
        description="用户在本页绑定 claim_code 后，让 Codex 执行 poll。Skill 会写入 ~/.teampulse/credentials.json。"
      >
        <CodeBlock command={commands.skillPoll} />
      </Step>
      <PromptBlock title="给 Codex 的一句话" text={commands.codexPrompt} />
    </div>
  );
}

function ClaudePanel({ commands }: { commands: ReturnType<typeof buildCommands> }) {
  return (
    <div className="mt-5 space-y-5">
      <Step
        index={1}
        title="启用 Claude Code 插件"
        description="插件目录是 packages/plugin，声明文件是 packages/plugin/.claude-plugin/plugin.json。启用后重启 Claude Code。"
      />
      <Step
        index={2}
        title="新会话获取认领码"
        description="在任意 Git 仓库打开 Claude Code，会话上下文出现 [TeamPulse 待认领] 时，把 Claim code 拿到本页绑定。"
      />
      <Step
        index={3}
        title="重新开会话自动领取"
        description="绑定完成后再开一次 Claude Code 会话，插件会调用领取接口并写入 ~/.teampulse/credentials.json。"
      />
      <PromptBlock title="给 Claude Code 的一句话" text={commands.claudePrompt} />
    </div>
  );
}

function OpenClawPanel({ commands }: { commands: ReturnType<typeof buildCommands> }) {
  return (
    <div className="mt-5 space-y-5">
      <Step
        index={1}
        title="把 curl 包装成 Skill"
        description="Skillhub / OpenClaw 这类工具不需要专门协议。安装 TeamPulse Agent Skill 后，注册、暂存 secret、领取 token、写凭据都由 Skill 完成。"
      >
        <CodeBlock command={commands.skillRegister} />
      </Step>
      <Step
        index={2}
        title="绑定仍由用户确认"
        description="Agent 只返回 claim_code；用户用自己的 TeamPulse 账号在本页绑定，避免团队里多个账号串号。"
      />
      <Step
        index={3}
        title="领取 token 并写入本机凭据"
        description="绑定后让 Agent 执行 poll。Skill 会写入 ~/.teampulse/credentials.json，后续上报直接复用。"
      >
        <CodeBlock command={commands.skillPoll} />
      </Step>
      <PromptBlock title="给通用 Agent 的一句话" text={commands.genericPrompt} />
    </div>
  );
}

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  );
}

function CodeBlock({ command, subtle = false }: { command: string; subtle?: boolean }) {
  return (
    <pre
      className={
        "mt-3 overflow-x-auto whitespace-pre-wrap rounded-md p-3 text-xs leading-5 " +
        (subtle ? "bg-slate-100 text-slate-800" : "bg-slate-950 text-white")
      }
    >
      {command}
    </pre>
  );
}

function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-slate-800">
        {text}
      </pre>
    </div>
  );
}

function buildCommands(appUrl: string) {
  const connectorUrl = `${appUrl}/agent/teampulse-connect.mjs`;
  const installConnector = `mkdir -p "$HOME/.teampulse/bin"
curl -fsSL "${connectorUrl}" -o "$HOME/.teampulse/bin/teampulse-connect.mjs"
chmod 700 "$HOME/.teampulse/bin/teampulse-connect.mjs"`;

  const skillRegister = `node "$HOME/.teampulse/bin/teampulse-connect.mjs" register --server-url ${appUrl}`;
  const skillPoll = `node "$HOME/.teampulse/bin/teampulse-connect.mjs" poll --server-url ${appUrl}`;
  const skillStatus = `node "$HOME/.teampulse/bin/teampulse-connect.mjs" status`;

  const curlRegister = `curl -sS -X POST "${appUrl}/api/v1/devices/register" \\
  -H "Content-Type: application/json" \\
  -d "{\\"hostname\\":\\"$(hostname)\\",\\"os\\":\\"$(uname -s)\\"}"`;

  const curlPoll = `CLAIM_CODE="AB-CD-EF"
DEVICE_SECRET="把注册响应里的 device_secret 粘到这里"

curl -sS -X POST "${appUrl}/api/v1/devices/claim-code/$CLAIM_CODE" \\
  -H "Content-Type: application/json" \\
  -d "{\\"device_secret\\":\\"$DEVICE_SECRET\\"}"`;

  const genericPrompt = `请使用 TeamPulse Agent Skill 接入当前机器。
先执行注册命令，把 claim_code 返回给我；等我在 TeamPulse “我的接入”页面绑定后，再执行 poll 写入 ~/.teampulse/credentials.json。`;

  const codexPrompt = `请为当前 Codex 环境接入 TeamPulse。
使用 TeamPulse Agent Skill，不要依赖 TeamPulse 项目源码里的开发命令。
先执行注册命令，把 claim_code 返回给我；等我绑定后再执行 poll 写入 ~/.teampulse/credentials.json。`;

  const claudePrompt = `请启用当前仓库的 TeamPulse Claude Code 插件（packages/plugin）。
重启 Claude Code 后，在任意 Git 仓库开启会话。
如果会话上下文出现 [TeamPulse 待认领]，请把 Claim code 返回给我。`;

  const skillPrompt = `请使用 TeamPulse Agent Skill 接入当前机器。
如果还没有连接脚本，先执行：
${installConnector}

然后执行：
${skillRegister}

把输出里的 claim_code 返回给我。等我在 TeamPulse 页面绑定后，再执行：
${skillPoll}

最后用下面命令确认已写入凭据：
${skillStatus}`;

  return {
    installConnector,
    skillRegister,
    skillPoll,
    skillStatus,
    curlRegister,
    curlPoll,
    genericPrompt,
    codexPrompt,
    claudePrompt,
    skillPrompt,
  };
}
