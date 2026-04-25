import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold">
              TeamPulse
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">
                工作台
              </Link>
              <Link href="/admin/devices" className="hover:text-foreground">
                设备管理
              </Link>
              <Link href="/admin/users" className="hover:text-foreground">
                用户管理
              </Link>
            </nav>
          </div>
          <div className="text-xs text-muted-foreground">
            {user.displayName ?? user.name} · 管理员
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
