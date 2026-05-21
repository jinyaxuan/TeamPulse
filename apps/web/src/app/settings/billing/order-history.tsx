"use client";

interface OrderRow {
  id: string;
  tradeOrderId: string;
  amount: number;
  months: number;
  title: string;
  status: string;
  paymentChannel: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "待支付", className: "bg-amber-100 text-amber-800" },
  paid: { label: "已支付", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "失败", className: "bg-red-100 text-red-800" },
  refunded: { label: "已退款", className: "bg-slate-100 text-slate-800" },
};

export function OrderHistory({ orders }: { orders: OrderRow[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">订单</th>
            <th className="px-4 py-2 text-left">金额</th>
            <th className="px-4 py-2 text-left">状态</th>
            <th className="px-4 py-2 text-left">时间</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const s = statusMap[order.status] ?? statusMap.pending;
            return (
              <tr key={order.id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <div className="font-medium">{order.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {order.tradeOrderId}
                  </div>
                </td>
                <td className="px-4 py-2">
                  ¥{(order.amount / 100).toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}
                  >
                    {s.label}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString("zh-CN")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
