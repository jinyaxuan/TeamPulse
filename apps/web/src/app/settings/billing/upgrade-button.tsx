"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

const MONTH_OPTIONS = [
  { months: 1, label: "1 个月", price: 49, discount: "" },
  { months: 3, label: "3 个月", price: 139, discount: "省5%" },
  { months: 6, label: "6 个月", price: 269, discount: "省8%" },
  { months: 12, label: "12 个月", price: 499, discount: "省15%" },
];

export function UpgradeButton({
  planSlug,
  label = "升级到专业版",
  showMonthSelector = false,
}: {
  planSlug: string;
  label?: string;
  showMonthSelector?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonths, setSelectedMonths] = useState(1);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/v1/billing/create-order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_slug: planSlug, months: selectedMonths }),
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
      {showMonthSelector && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MONTH_OPTIONS.map((opt) => (
            <button
              key={opt.months}
              type="button"
              onClick={() => setSelectedMonths(opt.months)}
              className={
                "rounded-md border px-3 py-2 text-xs transition " +
                (selectedMonths === opt.months
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-muted-foreground hover:border-slate-300")
              }
            >
              <div className="font-medium">{opt.label}</div>
              <div>{"¥" + opt.price}</div>
              {opt.discount && (
                <div className="mt-0.5 text-emerald-600">{opt.discount}</div>
              )}
            </button>
          ))}
        </div>
      )}
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

export function CancelButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  async function handleCancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/v1/billing/cancel"), {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "取消失败");
        return;
      }
      setDone(true);
      setConfirming(false);
      window.location.reload();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <p className="text-sm text-muted-foreground">{"订阅已取消"}</p>;
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-muted-foreground hover:text-red-600 hover:underline"
      >
        {"取消订阅"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-600">{"确认取消？"}</span>
      <button
        onClick={handleCancel}
        disabled={loading}
        className="rounded-md bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
      >
        {loading ? "..." : "确认"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50"
      >
        {"返回"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
