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
          <h1 className="text-2xl font-semibold">加入 TeamPulse</h1>
          <p className="mt-1 text-sm opacity-80">仅支持邀请码注册</p>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          使用管理员发放的邀请码创建账号。注册成功后会直接进入“我的接入”，继续绑定你的 Agent。
        </p>
        <div className="mt-6">
          <RegisterForm />
        </div>
      </div>
    </main>
  );
}
