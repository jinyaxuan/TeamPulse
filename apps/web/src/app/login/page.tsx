import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">TeamPulse</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Developers without an admin password: install the Claude Code plugin and ask your admin to approve your device.
        </p>
      </div>
    </main>
  );
}
