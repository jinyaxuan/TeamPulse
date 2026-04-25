import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ClaimDeviceForm } from "./claim-device-form";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3002";
  const cliRegisterCommand = `teampulse-codex register --server-url ${appUrl}`;
  const cliPollCommand = `teampulse-codex poll --server-url ${appUrl}`;
  const workspaceRegisterCommand = `pnpm --filter @teampulse/codex-plugin register -- --server-url ${appUrl}`;
  const workspacePollCommand = `pnpm --filter @teampulse/codex-plugin poll -- --server-url ${appUrl}`;
  const genericAgentPrompt = `请为当前机器注册 TeamPulse 设备，执行：
${cliRegisterCommand}
完成后把终端输出的 claim_code 返回给我。等我在 TeamPulse 页面完成绑定后，再执行：
${cliPollCommand}`;
  const claudePrompt = `请启用当前仓库的 TeamPulse Claude Code 插件（插件目录：packages/plugin）。
重启 Claude Code 后，在任意 Git 仓库开启会话。
如果会话上下文出现 [TeamPulse 待认领]，请把 Claim code 返回给我。`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">我的接入</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按当前登录账号绑定 Claude Code、Codex、OpenClaw 等 Agent 设备。多人团队里，每个成员都从自己的账号进入这里认领。
        </p>
      </div>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-xs font-medium uppercase text-muted-foreground">当前绑定目标</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{user.displayName ?? user.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            @{user.name}
          </span>
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
            当前登录账号
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          设备绑定后，任务、心跳、文件触碰记录都会归到这个账号下。切换账号前不要复用同一个认领码。
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">选择 Agent 类型</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            不同 Agent 的安装方式不同，但账号归属都由下面的“绑定到当前账号”步骤决定。
          </p>
        </div>

        <AgentGuideCard
          title="Codex"
          badge="已支持"
          description="适合 Codex CLI / Codex 插件。用 TeamPulse CLI 注册设备，页面认领后再 poll 写入凭据。"
          steps={[
            {
              title: "注册本机设备",
              description: "在需要接入 TeamPulse 的机器上执行。终端会输出 claim_code。",
              command: cliRegisterCommand,
              fallbackCommand: workspaceRegisterCommand,
            },
            {
              title: "页面绑定",
              description: "把 claim_code 填到下方“绑定到当前账号”。",
            },
            {
              title: "写入本机凭据",
              description: "页面绑定完成后回到终端执行。成功后后续任务会归属到当前账号。",
              command: cliPollCommand,
              fallbackCommand: workspacePollCommand,
            },
          ]}
        />

        <AgentGuideCard
          title="Claude Code"
          badge="插件接入"
          description="使用仓库里的 Claude Code 插件。插件会在会话启动时自动注册设备，并在下一次会话里自动领取页面绑定后的凭据。"
          steps={[
            {
              title: "安装或启用插件",
              description: "插件目录是 packages/plugin，声明文件是 packages/plugin/.claude-plugin/plugin.json。安装后重启 Claude Code。",
            },
            {
              title: "启动会话获取认领码",
              description: "在任意 Git 仓库打开 Claude Code。会话上下文出现 [TeamPulse 待认领] 时，把 Claim code 拿到本页面绑定。",
            },
            {
              title: "完成绑定",
              description: "绑定后重新打开一次 Claude Code 会话，插件会自动 poll 并写入 ~/.teampulse/credentials.json。",
            },
          ]}
          prompt={claudePrompt}
        />

        <AgentGuideCard
          title="OpenClaw / 通用 Agent"
          badge="通用流程"
          description="只要 Agent 能执行终端命令，就可以走 TeamPulse CLI。Skillhub 这类商店也可以把这段包装成一个 Skill。"
          steps={[
            {
              title: "让 Agent 注册设备",
              description: "让 OpenClaw 或其它 Agent 执行注册命令，并把 claim_code 返回给你。",
              command: cliRegisterCommand,
              fallbackCommand: workspaceRegisterCommand,
            },
            {
              title: "当前账号确认绑定",
              description: "你在本页面输入 claim_code。这个确认动作决定设备属于哪个账号，避免多人团队串号。",
            },
            {
              title: "让 Agent 写入凭据",
              description: "页面绑定后，让 Agent 执行 poll。之后它就能用同一个 token 上报任务。",
              command: cliPollCommand,
              fallbackCommand: workspacePollCommand,
            },
          ]}
          prompt={genericAgentPrompt}
        />
      </section>

      <ClaimDeviceForm />

      <section className="rounded-lg border bg-white p-4 text-sm text-muted-foreground shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">账号隔离规则</h2>
        <p className="mt-2">
          不管是 Codex、Claude Code 还是 OpenClaw，设备最终归属都以本页面当前登录账号为准。
          所以团队里账号再多，也只需要让成员登录自己的账号后输入自己的认领码。
        </p>
      </section>
    </div>
  );
}

type AgentStep = {
  title: string;
  description: string;
  command?: string;
  fallbackCommand?: string;
};

function AgentGuideCard({
  title,
  badge,
  description,
  steps,
  prompt,
}: {
  title: string;
  badge: string;
  description: string;
  steps: AgentStep[];
  prompt?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{badge}</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <div key={`${title}-${step.title}`} className="rounded-md border bg-slate-50 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{step.title}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                {step.command && <CommandBlock command={step.command} />}
                {step.fallbackCommand && (
                  <details className="mt-3 text-xs text-muted-foreground">
                    <summary className="cursor-pointer text-foreground">在当前源码仓库内运行</summary>
                    <CommandBlock command={step.fallbackCommand} subtle />
                  </details>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {prompt && (
        <div className="mt-4 rounded-md border bg-white p-3">
          <div className="text-xs font-medium text-muted-foreground">给 Agent 的自然语言指令</div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs leading-5 text-white">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}

function CommandBlock({ command, subtle = false }: { command: string; subtle?: boolean }) {
  return (
    <pre
      className={
        "mt-3 overflow-x-auto whitespace-pre-wrap rounded-md p-3 text-xs leading-5 " +
        (subtle ? "bg-white text-slate-800" : "bg-slate-950 text-white")
      }
    >
      {command}
    </pre>
  );
}
