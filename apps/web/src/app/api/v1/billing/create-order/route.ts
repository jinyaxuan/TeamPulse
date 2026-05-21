import { db, orders } from "@/db";
import { handler, json, parseBody, requireAuth, ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { getPlanBySlug, generateTradeOrderId } from "@/lib/subscription";
import { createPayment } from "@/lib/xunhupay";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  plan_slug: z.enum(["pro"]),
  months: z.number().int().min(1).max(12).default(1),
});

export const POST = handler(async (request) => {
  const ctx = await requireAuth(request);

  // Rate limit per user: 10 orders per hour
  const rl = rateLimit(`billing:${ctx.user.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "订单创建过于频繁，请稍后再试" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { plan_slug, months } = await parseBody(request, schema);

  const plan = await getPlanBySlug(plan_slug);
  if (!plan || plan.priceMonthly <= 0) {
    throw new ApiError("无效的套餐", 400);
  }

  if (!env.XUNHU_APPID || !env.XUNHU_APPSECRET) {
    throw new ApiError("支付尚未配置，请联系管理员", 503);
  }

  const amount = plan.priceMonthly * months; // in fen
  const tradeOrderId = generateTradeOrderId();
  const title = `TeamPulse ${plan.name} - ${months}个月`;
  const baseUrl = env.PUBLIC_APP_URL;

  // Create order record
  await db.insert(orders).values({
    userId: ctx.user.id,
    planId: plan.id,
    tradeOrderId,
    amount,
    months,
    title,
    status: "pending",
  });

  // Call XunhuPay API
  const totalFee = (amount / 100).toFixed(2);
  const result = await createPayment({
    tradeOrderId,
    totalFee,
    title,
    notifyUrl: `${baseUrl}/api/v1/billing/notify`,
    returnUrl: `${baseUrl}/api/v1/billing/return`,
  });

  return json({
    order_id: tradeOrderId,
    payment_url: result.url,
    qrcode_url: result.url_qrcode,
  });
});
