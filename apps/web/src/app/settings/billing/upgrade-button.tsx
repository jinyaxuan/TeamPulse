"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

export function UpgradeButton({
  planSlug,
  label = "升级到专业版",
  months = 1,
}: {
  planSlug: string;
  label?: string;
  months?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/v1/billing/create-order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_slug: planSlug, months }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "创建订单失败");
        return;
      }

      const data = await res.json();
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        setError("未获取到支付链接");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? "处理中..." : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
