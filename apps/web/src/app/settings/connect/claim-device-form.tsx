"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

export function ClaimDeviceForm() {
  const router = useRouter();
  const [claimCode, setClaimCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const res = await fetch(withBasePath("/api/v1/devices/claim-self"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_code: claimCode.trim() }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "绑定失败，请确认认领码是否正确");
      return;
    }

    setClaimCode("");
    setMessage("设备已绑定到当前账号。告诉 Agent 继续，它会自动完成本机凭据写入。");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold">绑定到当前账号</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          输入 Agent 返回的认领码。绑定后，后续任务会归属到当前登录用户。
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={claimCode}
          onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
          placeholder="例如 AB-CD-EF"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={pending || !claimCode.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
        >
          绑定设备
        </button>
      </div>

      {message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </form>
  );
}
