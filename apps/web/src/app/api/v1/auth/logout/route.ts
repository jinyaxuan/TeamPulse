import { cookies } from "next/headers";
import { clearSessionCookie, deleteSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { OIDC_AUTO_LOGIN_PAUSE_COOKIE } from "@/lib/oidc";
import { handler, json } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


export const POST = handler(async () => {
  const cookieStore = cookies();
  const sid = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (sid) {
    await deleteSession(sid);
  }
  await clearSessionCookie();
  cookieStore.set(OIDC_AUTO_LOGIN_PAUSE_COOKIE, "1", {
    httpOnly: true,
    secure: env.PUBLIC_APP_URL.startsWith("https://"),
    sameSite: "lax",
    maxAge: 120,
    path: "/",
  });
  return json({ ok: true });
});
