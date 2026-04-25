"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={logout}
      disabled={pending}
      className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {pending ? "…" : "Sign out"}
    </button>
  );
}
