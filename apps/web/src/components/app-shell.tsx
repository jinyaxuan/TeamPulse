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
        "rounded-full px-3.5 py-2 text-sm font-medium transition duration-200",
        activeNav === key
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-white hover:text-foreground hover:shadow-sm"
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="tp-grid-bg min-h-screen">
      <header className="sticky top-0 z-20 border-b border-black/[0.04] bg-white/82 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between sm:px-6">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-1 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Link href="/" className="flex flex-shrink-0 items-center gap-2.5 text-sm font-semibold">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-xs text-background shadow-[0_14px_28px_-18px_rgba(0,0,0,0.7)]">
                  TP
                </span>
                <span className="leading-none">
                  TeamPulse
                  <span className="block text-[10px] font-medium text-muted-foreground">
                    Agent 协作
                  </span>
                </span>
              </Link>
              <div className="flex min-w-0 flex-shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground lg:hidden">
                <Link href="/help" className="rounded-full px-2.5 py-1.5 hover:bg-surface hover:text-foreground">
                  帮助
                </Link>
                <Link
                  href="/settings/profile"
                  className="max-w-28 truncate whitespace-nowrap rounded-full bg-surface px-3 py-1.5 font-medium text-foreground hover:bg-accent"
                >
                  {user.displayName ?? user.name}
                </Link>
                <LogoutButton />
              </div>
            </div>
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-surface/80 p-1 lg:flex-1">
              {navItem("/", "指挥台", "home")}
              {navItem("/projects", "项目", "projects")}
              {navItem("/activity", "动态", "activity")}
              {navItem("/team", "团队", "team")}
              {user.role === "admin" && (
                <>
                  <Link
                    href="/admin/users"
                    className="ml-1 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-white hover:text-foreground hover:shadow-sm"
                  >
                    用户管理
                  </Link>
                  <Link
                    href="/admin/devices"
                    className="rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-white hover:text-foreground hover:shadow-sm"
                  >
                    Agent 管理
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="hidden flex-shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground lg:ml-auto lg:flex">
            <Link
              href="/help"
              className="rounded-full px-2.5 py-1.5 hover:bg-surface hover:text-foreground"
            >
              帮助
            </Link>
            <Link
              href="/settings/profile"
              className="max-w-40 truncate whitespace-nowrap rounded-full bg-surface px-3 py-1.5 font-medium text-foreground hover:bg-accent"
            >
              {user.displayName ?? user.name}
            </Link>
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-accent-foreground">{roleLabel(user.role)}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:py-7">{children}</main>
    </div>
  );
}
