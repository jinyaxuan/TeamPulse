import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="rounded-md bg-primary px-4 py-3 text-primary-foreground">
          <h1 className="text-2xl font-semibold">TeamPulse</h1>
          <p className="mt-1 text-sm opacity-80">团队 AI 协作面板</p>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">使用统一身份账号登录，查看团队实时任务、项目动态和设备接入状态。</p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <p>
            没有账号？请联系管理员在{" "}
            <a href="https://casdoor.tangchaolizi.com" target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
              身份管理平台
            </a>
            {" "}创建。
          </p>
          <a href="/pricing" className="font-medium text-primary hover:underline">
            查看定价
          </a>
        </div>
      </div>
    </main>
  );
}
