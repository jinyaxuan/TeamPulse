import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const loginPageSource = readFileSync(
  fileURLToPath(new URL("../../src/app/login/page.tsx", import.meta.url)),
  "utf8"
);
const homePageSource = readFileSync(
  fileURLToPath(new URL("../../src/app/page.tsx", import.meta.url)),
  "utf8"
);

test("OIDC-enabled login page does not auto-redirect before showing login choices", () => {
  assert.doesNotMatch(
    loginPageSource,
    /redirect\(\s*["']\/api\/v1\/auth\/oidc["']\s*\)/,
    "anonymous visitors must see the login page instead of being sent straight to OIDC"
  );
  assert.match(
    loginPageSource,
    /if\s*\(user\)\s*redirect\(["']\/["']\)/,
    "authenticated users must still leave the login page"
  );
  assert.match(
    homePageSource,
    /if\s*\(!user\)\s*redirect\(["']\/login["']\)/,
    "the team dashboard must remain protected for anonymous visitors"
  );
});

test("local query and logout pause cookie remain represented on the login page", () => {
  assert.match(
    loginPageSource,
    /searchParams\?\.local\s*===\s*["']1["']\s*\|\|\s*cookies\(\)\.get\(OIDC_AUTO_LOGIN_PAUSE_COOKIE\)/,
    "logout's local fallback signal must continue to be recognized"
  );
  assert.match(
    loginPageSource,
    /<OidcButton\s*\/>/,
    "the explicit unified-auth choice must remain available"
  );
});

test("login page still renders the local form and registration entry", () => {
  assert.match(loginPageSource, /<LoginForm\s*\/>/);
  assert.match(loginPageSource, /href=["']\/register["']/);
  assert.match(
    loginPageSource,
    /env\.OIDC_ENABLED\s*&&\s*\(/,
    "OIDC remains an explicit optional login choice"
  );
});

const runtimeBaseUrl = process.env.TEAMPULSE_TEST_URL?.replace(/\/+$/, "");

test(
  "runtime auth entry exposes choices without opening the dashboard",
  { skip: !runtimeBaseUrl ? "set TEAMPULSE_TEST_URL to run the HTTP smoke" : false },
  async () => {
    const loginResponse = await fetch(`${runtimeBaseUrl}/login`, { redirect: "manual" });
    assert.equal(loginResponse.status, 200);
    const loginHtml = await loginResponse.text();
    assert.doesNotMatch(loginHtml, /NEXT_REDIRECT;replace;\/api\/v1\/auth\/oidc/);
    assert.match(loginHtml, /统一身份登录/);
    assert.match(loginHtml, /href="\/register"/);

    const registerResponse = await fetch(`${runtimeBaseUrl}/register`, { redirect: "manual" });
    assert.equal(registerResponse.status, 200);
    assert.match(await registerResponse.text(), /注册并进入 TeamPulse/);

    const homeResponse = await fetch(`${runtimeBaseUrl}/`, { redirect: "manual" });
    assert.equal(homeResponse.status, 200);
    assert.match(await homeResponse.text(), /NEXT_REDIRECT;replace;\/login/);
  }
);
