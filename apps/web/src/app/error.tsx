"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <span className="text-2xl text-red-400">!</span>
        </div>
        <h1 className="mt-6 text-xl font-semibold text-slate-900">
          {"出错了"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {"页面加载时发生了意外错误，请重试或返回工作台。"}
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {"重试"}
          </button>
          <Link
            href="/"
            className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {"返回工作台"}
          </Link>
        </div>
      </div>
    </main>
  );
}
