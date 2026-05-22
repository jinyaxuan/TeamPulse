import Link from "next/link";
import type { User } from "@/db";
import { cn, roleLabel } from "@/lib/utils";
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
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
        activeNav === key
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="tp-grid-bg min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-surface-strong/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:items-center">
            <Link href="/" className="flex flex-shrink-0 items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-xs text-background shadow-sm">
                TP
              </span>
              <span className="leading-none">
                TeamPulse
                <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Agent Ops
                </span>
              </span>
            </Link>
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 sm:flex-1 sm:pb-0">
              {navItem("/", "指挥台", "home")}
              {navItem("/projects", "项目", "projects")}
              {navItem("/activity", "动态", "activity")}
              {navItem("/team", "团队", "team")}
              {user.role === "admin" && (
                <>
                  <Link
                    href="/admin/users"
                    className="ml-3 rounded-md border bg-white px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    用户管理
                  </Link>
                  <Link
                    href="/admin/devices"
                    className="rounded-md border bg-white px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    Agent 管理
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground sm:ml-auto">
            <Link
              href="/help"
              className="rounded-md px-2 py-1.5 hover:bg-accent hover:text-foreground"
            >
              帮助
            </Link>
            <Link
              href="/settings/profile"
              className="max-w-40 truncate whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-accent hover:text-foreground"
            >
              {user.displayName ?? user.name}
            </Link>
            <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">{roleLabel(user.role)}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
