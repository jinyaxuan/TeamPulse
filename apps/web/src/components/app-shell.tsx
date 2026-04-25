import Link from "next/link";
import type { User } from "@/db";
import { roleLabel } from "@/lib/utils";
import { LogoutButton } from "./logout-button";

export function AppShell({
  user,
  children,
  activeNav,
}: {
  user: User;
  children: React.ReactNode;
  activeNav?: "home" | "projects" | "activity" | "team";
}) {
  const navItem = (href: string, label: string, key: string) => (
    <Link
      href={href}
      className={
        "rounded-md px-3 py-1.5 text-sm transition-colors " +
        (activeNav === key
          ? "bg-slate-900 text-white shadow-sm"
          : "text-muted-foreground hover:bg-slate-100 hover:text-foreground")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" className="flex flex-shrink-0 items-center gap-2 text-sm font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs text-white">
                TP
              </span>
              <span>TeamPulse</span>
            </Link>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {navItem("/", "工作台", "home")}
              {navItem("/projects", "项目", "projects")}
              {navItem("/activity", "动态", "activity")}
              {navItem("/team", "团队", "team")}
              {user.role === "admin" && (
                <Link
                  href="/admin/devices"
                  className="ml-3 rounded-md border bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-sm hover:text-foreground"
                >
                  管理
                </Link>
              )}
            </nav>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <Link
              href="/settings/profile"
              className="max-w-40 truncate whitespace-nowrap rounded-md px-2 py-1 hover:bg-slate-100 hover:text-foreground"
            >
              {user.displayName ?? user.name}
            </Link>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{roleLabel(user.role)}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
