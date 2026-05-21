/**
 * XunhuPay server-to-server callback. This is the ONLY trusted source for
 * payment confirmation. No auth required — XunhuPay calls this directly.
 */
import { eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { env } from "@/lib/env";
import { verifyCallback } from "@/lib/xunhupay";
import { activateSubscription } from "@/lib/subscription";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const text = await request.text();
    const params: Record<string, string> = {};
    for (const pair of new URLSearchParams(text)) {
      params[pair[0]] = pair[1];
    }

    // Verify signature
    if (!verifyCallback(params, env.XUNHU_APPSECRET)) {
      console.error("XunhuPay notify: invalid hash");
      return new NextResponse("fail", { status: 400 });
    }

    const tradeOrderId = params.trade_order_id;
    const status = params.status;

    if (!tradeOrderId) {
      return new NextResponse("fail", { status: 400 });
    }

    // Find the order
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.tradeOrderId, tradeOrderId))
      .limit(1);

    if (!order) {
      console.error(`XunhuPay notify: order not found: ${tradeOrderId}`);
      return new NextResponse("fail", { status: 404 });
    }

    // Already processed
    if (order.status === "paid") {
      return new NextResponse("success");
    }

    if (status === "OD" || status === "success") {
      // Payment successful
      await db
        .update(orders)
        .set({
          status: "paid",
          paymentChannel: params.payment_type ?? null,
          xunhuOrderId: params.out_trade_order ?? null,
          paidAt: new Date(),
          callbackRaw: JSON.stringify(params),
        })
        .where(eq(orders.id, order.id));

      // Activate subscription
      await activateSubscription(order.userId, order.planId, order.months);

      console.log(`Payment confirmed: ${tradeOrderId}`);
    } else {
      // Payment failed
      await db
        .update(orders)
        .set({
          status: "failed",
          callbackRaw: JSON.stringify(params),
        })
        .where(eq(orders.id, order.id));
    }

    // XunhuPay expects exactly "success" response
    return new NextResponse("success");
  } catch (err) {
    console.error("XunhuPay notify error:", err);
    return new NextResponse("fail", { status: 500 });
  }
}
