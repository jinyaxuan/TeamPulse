"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
        const res = await fetch("/api/v1/auth/magic/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (aborted) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Link invalid or expired");
          return;
        }
        router.replace("/");
        router.refresh();
      } catch {
        if (!aborted) setError("Network error");
      }
    })();
    return () => {
      aborted = true;
    };
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Signing you in…</h1>
        {error ? (
          <>
            <p className="mt-2 text-sm text-destructive">{error}</p>
            <a
              href="/login"
              className="mt-4 inline-block rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              Request a new link
            </a>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            One moment while we validate the link.
          </p>
        )}
      </div>
    </main>
  );
}
