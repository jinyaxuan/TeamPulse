import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="rounded-md bg-primary px-4 py-3 text-primary-foreground">
          <h1 className="text-2xl font-semibold">{"加入 TeamPulse"}</h1>
          <p className="mt-1 text-sm opacity-80">{"免费注册，立即体验 AI Agent 团队协作"}</p>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          {"创建账号后即可接入 Claude Code、Codex 等 AI 编码助手，实现团队实时协调。"}
        </p>
        <div className="mt-6">
          <RegisterForm />
        </div>
      </div>
    </main>
  );
}
