import type { User } from "@/db";
import { cn, roleLabel } from "@/lib/utils";
import { NavigationProgressProvider, ProgressLink } from "./navigation-progress";
import { LogoutButton } from "./logout-button";
import { RouteTransition } from "./route-transition";

export function AppShell({
  user,
  children,
  activeNav,
}: {
  user: User;
  children: React.ReactNode;
  activeNav?: "home" | "projects" | "activity" | "team" | "admin-users" | "admin-devices";
}) {
  const navItem = (href: string, label: string, key: string) => (
    <ProgressLink
      href={href}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-medium transition duration-200 active:translate-y-px",
        activeNav === key
          ? "bg-foreground text-background shadow-[0_12px_30px_-20px_rgba(15,23,42,0.9)]"
          : "text-muted-foreground hover:bg-white hover:text-foreground hover:shadow-sm"
      )}
    >
      {label}
    </ProgressLink>
  );

  return (
    <NavigationProgressProvider>
      <div className="tp-grid-bg min-h-screen">
        <header className="sticky top-0 z-20 border-b border-black/[0.05] bg-white/80 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between sm:px-6">
            <div className="flex min-w-0 flex-col gap-2 lg:flex-1 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <ProgressLink href="/" className="group flex flex-shrink-0 items-center gap-2.5 rounded-full pr-3 text-sm font-semibold transition hover:bg-white/70">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-xs text-background shadow-[0_14px_28px_-18px_rgba(15,23,42,0.8)] transition group-hover:scale-[1.03]">
                    TP
                  </span>
                  <span className="leading-none">
                    TeamPulse
                    <span className="block text-[10px] font-medium text-muted-foreground">
                      Agent 协作
                    </span>
                  </span>
                </ProgressLink>
                <div className="flex min-w-0 flex-shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground lg:hidden">
                  <ProgressLink href="/help" className="rounded-full px-2.5 py-1.5 transition hover:bg-surface hover:text-foreground">
                    帮助
                  </ProgressLink>
                  <ProgressLink
                    href="/settings/profile"
                    className="max-w-28 truncate whitespace-nowrap rounded-full bg-white/80 px-3 py-1.5 font-medium text-foreground ring-1 ring-black/[0.04] transition hover:bg-accent"
                  >
                    {user.displayName ?? user.name}
                  </ProgressLink>
                  <LogoutButton />
                </div>
              </div>
              <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-black/[0.04] bg-white/60 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] lg:flex-1">
                {navItem("/", "指挥台", "home")}
                {navItem("/projects", "项目", "projects")}
                {navItem("/activity", "动态", "activity")}
                {navItem("/team", "团队", "team")}
                {user.role === "admin" && (
                  <>
                    <ProgressLink
                      href="/admin/users"
                      className={cn(
                        "ml-1 rounded-full px-3 py-2 text-xs font-medium transition active:translate-y-px",
                        activeNav === "admin-users"
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-white hover:text-foreground hover:shadow-sm"
                      )}
                    >
                      用户管理
                    </ProgressLink>
                    <ProgressLink
                      href="/admin/devices"
                      className={cn(
                        "rounded-full px-3 py-2 text-xs font-medium transition active:translate-y-px",
                        activeNav === "admin-devices"
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-white hover:text-foreground hover:shadow-sm"
                      )}
                    >
                      Agent 管理
                    </ProgressLink>
                  </>
                )}
              </nav>
            </div>
            <div className="hidden flex-shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground lg:ml-auto lg:flex">
              <ProgressLink
                href="/help"
                className="rounded-full px-2.5 py-1.5 transition hover:bg-surface hover:text-foreground"
              >
                帮助
              </ProgressLink>
              <ProgressLink
                href="/settings/profile"
                className="max-w-40 truncate whitespace-nowrap rounded-full bg-white/80 px-3 py-1.5 font-medium text-foreground ring-1 ring-black/[0.04] transition hover:bg-accent"
              >
                {user.displayName ?? user.name}
              </ProgressLink>
              <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-accent-foreground ring-1 ring-black/[0.03]">{roleLabel(user.role)}</span>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:py-8">
          <RouteTransition>{children}</RouteTransition>
        </main>
      </div>
    </NavigationProgressProvider>
  );
}
