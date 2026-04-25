import { redirect } from "next/navigation";
import Link from "next/link";
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
        <p className="mt-5 text-sm text-muted-foreground">登录后查看团队实时任务、项目动态和设备接入状态。</p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          没有账号？请让管理员发放邀请码，然后{" "}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            使用邀请码注册
          </Link>
          。
        </p>
      </div>
    </main>
  );
}
