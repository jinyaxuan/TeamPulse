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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">我的接入</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按当前登录账号绑定 Claude Code / Codex 设备。多人团队里，每个成员都从自己的账号进入这里认领。
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
        <StepCard
          step="1"
          title="注册本机设备"
          description="在需要接入 TeamPulse 的机器上执行。终端会输出一个认领码。"
          command={cliRegisterCommand}
          fallbackCommand={workspaceRegisterCommand}
        />
        <ClaimDeviceForm />
        <StepCard
          step="3"
          title="写入本机凭据"
          description="在页面绑定认领码后，再回终端执行。成功后本机后续任务会自动归属到当前账号。"
          command={cliPollCommand}
          fallbackCommand={workspacePollCommand}
        />
      </section>

      <section className="rounded-lg border bg-white p-4 text-sm text-muted-foreground shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">给 Agent 的自然语言指令</h2>
        <p className="mt-2">
          可以直接让 Agent 执行下面这句话。它只负责注册本机设备并把认领码返回给你；最终绑定仍由你在当前账号页面确认。
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-white">
{`请为当前机器注册 TeamPulse 设备，执行：
${cliRegisterCommand}
完成后把终端输出的 claim_code 返回给我。`}
        </pre>
      </section>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
  command,
  fallbackCommand,
}: {
  step: string;
  title: string;
  description: string;
  command: string;
  fallbackCommand: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
          {step}
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <pre className="mt-4 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-white">
        {command}
      </pre>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-foreground">在当前源码仓库内运行</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-100 p-3 text-slate-800">
          {fallbackCommand}
        </pre>
      </details>
    </div>
  );
}
