"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function logout() {
    await fetch(withBasePath("/api/v1/auth/logout"), { method: "POST" });
    startTransition(() => {
      router.replace(withBasePath("/login?local=1"));
      router.refresh();
    });
  }

  return (
    <button
      onClick={logout}
      disabled={pending}
      className={cn("whitespace-nowrap rounded-full px-2 py-1 text-xs text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-50", pending && "tp-pending")}
    >
      {pending ? "退出中…" : "退出"}
    </button>
  );
}
