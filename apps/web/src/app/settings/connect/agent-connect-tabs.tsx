"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type TabKey = "curl" | "codex" | "claude" | "openclaw";

type TabConfig = {
  key: TabKey;
  title: string;
  badge: string;
  description: string;
};

const TABS: TabConfig[] = [
  {
    key: "curl",
    title: "通用 curl",
    badge: "推荐",
    description: "最稳定的协议层接入方式，适合任何能执行终端命令的 Agent。",
  },
  {
    key: "codex",
    title: "Codex",
    badge: "插件/CLI",
    description: "Codex 可以直接走 curl 协议，也可以用项目内 Codex 插件自动写入凭据。",
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
    badge: "可包装",
    description: "把 curl 注册和领取 token 包装成 Skill，即可让不同 Agent 接入并按账号区分。",
  },
];

export function AgentConnectTabs({ appUrl }: { appUrl: string }) {
  const [active, setActive] = useState<TabKey>("curl");
  const commands = useMemo(() => buildCommands(appUrl), [appUrl]);
  const activeTab = TABS.find((tab) => tab.key === active) ?? TABS[0];

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">选择接入方式</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            推荐先用通用 curl 理解协议；不同 Agent 的差异只在本机如何保存 token。
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

        {active === "curl" && <CurlPanel commands={commands} />}
        {active === "codex" && <CodexPanel commands={commands} />}
        {active === "claude" && <ClaudePanel commands={commands} />}
        {active === "openclaw" && <OpenClawPanel commands={commands} />}
      </div>
    </section>
  );
}

function CurlPanel({ commands }: { commands: ReturnType<typeof buildCommands> }) {
  return (
    <div className="mt-5 space-y-5">
      <Step
        index={1}
        title="注册设备并拿到认领码"
        description="Agent 在本机执行。响应里的 claim_code 给用户绑定，device_secret 由 Agent 暂存到当前任务上下文或本机安全位置。"
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
        description="把上一步注册响应里的 claim_code 和 device_secret 填回环境变量，再调用领取接口。"
      >
        <CodeBlock command={commands.curlPoll} />
      </Step>
    </div>
  );
}

function CodexPanel({ commands }: { commands: ReturnType<typeof buildCommands> }) {
  return (
    <div className="mt-5 space-y-5">
      <Step
        index={1}
        title="协议层仍然用 curl"
        description="如果只是让 Codex 注册并返回认领码，用通用 curl 最直观，不依赖本仓库插件是否安装。"
      >
        <CodeBlock command={commands.curlRegister} />
      </Step>
      <Step
        index={2}
        title="需要自动写凭据时用 Codex 插件"
        description="项目内 Codex 插件会复用同一套接口，并把 token 写入 ~/.teampulse/credentials.json。"
      >
        <CodeBlock command={commands.codexRegister} />
        <CodeBlock command={commands.codexPoll} subtle />
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
        description="Skillhub / OpenClaw 这类工具不需要专门协议，只要能执行终端命令，就让它先注册设备并返回 claim_code。"
      >
        <CodeBlock command={commands.curlRegister} />
      </Step>
      <Step
        index={2}
        title="绑定仍由用户确认"
        description="Agent 只返回 claim_code；用户用自己的 TeamPulse 账号在本页绑定，避免团队里多个账号串号。"
      />
      <Step
        index={3}
        title="领取 token 后交给 Agent 保存"
        description="绑定后让 Agent 调用领取接口。返回的 token 是后续上报任务、心跳和文件触碰记录的凭据。"
      >
        <CodeBlock command={commands.curlPoll} />
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
  const curlRegister = `curl -sS -X POST "${appUrl}/api/v1/devices/register" \\
  -H "Content-Type: application/json" \\
  -d "{\\"hostname\\":\\"$(hostname)\\",\\"os\\":\\"$(uname -s)\\"}"`;

  const curlPoll = `CLAIM_CODE="AB-CD-EF"
DEVICE_SECRET="把注册响应里的 device_secret 粘到这里"

curl -sS -X POST "${appUrl}/api/v1/devices/claim-code/$CLAIM_CODE" \\
  -H "Content-Type: application/json" \\
  -d "{\\"device_secret\\":\\"$DEVICE_SECRET\\"}"`;

  const codexRegister = `pnpm --filter @teampulse/codex-plugin register -- --server-url ${appUrl}`;
  const codexPoll = `pnpm --filter @teampulse/codex-plugin poll -- --server-url ${appUrl}`;

  const genericPrompt = `请用 curl 为当前机器注册 TeamPulse 设备：
${curlRegister}

把响应里的 claim_code 返回给我，并暂存 device_secret。
等我在 TeamPulse “我的接入”页面绑定 claim_code 后，再用同一个 claim_code 和 device_secret 调用领取 token 接口。`;

  const codexPrompt = `请为当前 Codex 环境接入 TeamPulse。
优先用 curl 注册设备并返回 claim_code；如果当前仓库里可以使用 @teampulse/codex-plugin，则绑定完成后执行 poll 写入 ~/.teampulse/credentials.json。`;

  const claudePrompt = `请启用当前仓库的 TeamPulse Claude Code 插件（packages/plugin）。
重启 Claude Code 后，在任意 Git 仓库开启会话。
如果会话上下文出现 [TeamPulse 待认领]，请把 Claim code 返回给我。`;

  return {
    curlRegister,
    curlPoll,
    codexRegister,
    codexPoll,
    genericPrompt,
    codexPrompt,
    claudePrompt,
  };
}
