"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

/**
 * Consumes the magic link by POSTing to /api/v1/auth/magic/consume which
 * sets the session cookie. Then redirects to home.
 */
export function MagicConsumer({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(withBasePath("/api/v1/auth/magic/consume"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (aborted) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "链接无效或已过期");
          return;
        }
        router.replace("/");
        router.refresh();
      } catch {
        if (!aborted) setError("网络异常");
      }
    })();
    return () => {
      aborted = true;
    };
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">正在登录…</h1>
        {error ? (
          <>
            <p className="mt-2 text-sm text-destructive">{error}</p>
            <a
              href={withBasePath("/login")}
              className="mt-4 inline-block rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              重新获取链接
            </a>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            请稍等，正在校验登录链接。
          </p>
        )}
      </div>
    </main>
  );
}
