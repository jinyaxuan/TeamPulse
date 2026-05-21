/**
 * XunhuPay browser redirect after payment. This is for UX only —
 * never trust this for payment verification (use notify instead).
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyCallback } from "@/lib/xunhupay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    params[key] = value;
  }

  const baseUrl = env.PUBLIC_APP_URL;
  const valid = verifyCallback(params, env.XUNHU_APPSECRET);
  const status = valid ? "success" : "unknown";

  return NextResponse.redirect(
    `${baseUrl}/settings/billing?payment=${status}`,
    { status: 302 }
  );
}
