import { cookies } from "next/headers";
import { clearSessionCookie, deleteSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { handler, json } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


export const POST = handler(async () => {
  const sid = cookies().get(env.SESSION_COOKIE_NAME)?.value;
  if (sid) {
    await deleteSession(sid);
  }
  await clearSessionCookie();
  return json({ ok: true });
});
