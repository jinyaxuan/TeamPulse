import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AgentConnectTabs } from "./agent-connect-tabs";
import { ClaimDeviceForm } from "./claim-device-form";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3002";

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

      <AgentConnectTabs appUrl={appUrl} />

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
