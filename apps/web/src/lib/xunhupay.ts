/**
 * XunhuPay (虎皮椒) payment integration.
 *
 * API docs: https://www.xunhupay.com/doc/api/pay.html
 * Signing: sort params by key ASC, join as key=value&, append appsecret, MD5.
 */
import { createHash, randomBytes } from "node:crypto";
import { env } from "./env";

const PAYMENT_URL = "https://api.xunhupay.com/payment/do.html";

/** MD5 hash signing per XunhuPay spec. */
export function sign(
  params: Record<string, string>,
  appsecret: string
): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "hash" && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5")
    .update(sorted + appsecret)
    .digest("hex");
}

/** Verify a callback hash from XunhuPay. */
export function verifyCallback(
  params: Record<string, string>,
  appsecret: string
): boolean {
  const receivedHash = params.hash;
  if (!receivedHash) return false;
  const computed = sign(params, appsecret);
  return computed === receivedHash;
}

export interface CreatePaymentParams {
  tradeOrderId: string;
  totalFee: string; // yuan, e.g. "49.00"
  title: string;
  notifyUrl: string;
  returnUrl: string;
  wapName?: string;
}

export interface CreatePaymentResult {
  openid: number;
  url_qrcode: string;
  url: string;
  errcode: number;
  errmsg: string;
  hash: string;
}

/** Create a payment order with XunhuPay. Returns the payment page URL. */
export async function createPayment(
  opts: CreatePaymentParams
): Promise<CreatePaymentResult> {
  const appid = env.XUNHU_APPID;
  const appsecret = env.XUNHU_APPSECRET;
  if (!appid || !appsecret) {
    throw new Error("XunhuPay credentials not configured");
  }

  const time = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomBytes(8).toString("hex");

  const params: Record<string, string> = {
    version: "1.1",
    appid,
    trade_order_id: opts.tradeOrderId,
    total_fee: opts.totalFee,
    title: opts.title,
    time,
    nonce_str: nonceStr,
    notify_url: opts.notifyUrl,
    return_url: opts.returnUrl,
    wap_name: opts.wapName ?? "TeamPulse",
  };

  params.hash = sign(params, appsecret);

  const body = new URLSearchParams(params);
  const res = await fetch(PAYMENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`XunhuPay error: ${data.errmsg ?? JSON.stringify(data)}`);
  }

  return data as CreatePaymentResult;
}
