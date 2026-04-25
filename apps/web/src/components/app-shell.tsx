import Link from "next/link";
import type { User } from "@/db";
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
        "rounded-md px-2 py-1 text-sm transition-colors " +
        (activeNav === key
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" className="flex-shrink-0 text-sm font-semibold">
              TeamPulse
            </Link>
            <nav className="flex items-center gap-1">
              {navItem("/", "Home", "home")}
              {navItem("/projects", "Projects", "projects")}
              {navItem("/activity", "Activity", "activity")}
              {navItem("/team", "Team", "team")}
              {user.role === "admin" && (
                <Link
                  href="/admin/devices"
                  className="ml-4 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="max-w-32 truncate whitespace-nowrap">{user.displayName ?? user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
