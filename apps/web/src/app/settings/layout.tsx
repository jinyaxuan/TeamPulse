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
      <div className="grid grid-cols-[180px_1fr] gap-8">
        <nav className="space-y-1">
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Settings
          </div>
          {item("/settings/profile", "Profile")}
          {item("/settings/devices", "Devices")}
          {item("/settings/memory", "Memory")}
        </nav>
        <div>{children}</div>
      </div>
    </AppShell>
  );
}
