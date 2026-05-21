import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <span className="text-2xl font-bold text-slate-400">404</span>
        </div>
        <h1 className="mt-6 text-xl font-semibold text-slate-900">
          {"页面未找到"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {"你访问的页面不存在或已被移除。"}
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {"返回工作台"}
          </Link>
          <Link
            href="/help"
            className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {"帮助中心"}
          </Link>
        </div>
      </div>
    </main>
  );
}
