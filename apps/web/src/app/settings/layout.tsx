import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const item = (href: string, label: string) => (
    <Link
      href={href}
      className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {label}
    </Link>
  );

  return (
    <AppShell user={user}>
      <div className="grid gap-6 lg:grid-cols-[180px_1fr] lg:gap-8">
        <nav className="space-y-1 rounded-md border bg-card p-2 lg:bg-transparent lg:p-0 lg:border-0">
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            设置
          </div>
          {item("/settings/profile", "个人资料")}
          {item("/settings/devices", "我的设备")}
          {item("/settings/memory", "记忆同步")}
        </nav>
        <div>{children}</div>
      </div>
    </AppShell>
  );
}
