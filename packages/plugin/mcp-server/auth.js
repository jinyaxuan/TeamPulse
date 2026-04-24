/**
 * Auth + credentials management for the TeamPulse plugin.
 *
 * - Reads/writes ~/.teampulse/credentials.json
 * - Reads/writes ~/.teampulse/device.json (pre-approval device secret)
 * - Handles device self-registration against the server
 * - Polls the claim-code endpoint until approved, then persists credentials
 */
import { mkdir, readFile, writeFile, chmod, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir, hostname, platform } from "node:os";
import { join } from "node:path";
import { request } from "undici";
import { execFileSync } from "node:child_process";

const TEAMPULSE_DIR = join(homedir(), ".teampulse");
const CREDENTIALS_PATH = join(TEAMPULSE_DIR, "credentials.json");
const DEVICE_PATH = join(TEAMPULSE_DIR, "device.json");

// Default server URL for the device-registration step, before credentials exist.
const BOOTSTRAP_SERVER_URL =
  process.env.TEAMPULSE_SERVER_URL || "http://localhost:3000";

export function isDisabled() {
  return process.env.TEAMPULSE_DISABLED === "1";
}

/**
 * Check if the user has temporarily paused TeamPulse via `teampulse pause`.
 * Reads ~/.teampulse/paused_until (ISO timestamp). If the file exists and
 * the timestamp is in the future, the plugin is paused.
 */
export async function isPaused() {
  const path = join(TEAMPULSE_DIR, "paused_until");
  try {
    const raw = await readFile(path, "utf-8");
    const until = new Date(raw.trim());
    return until.getTime() > Date.now();
  } catch {
    return false;
  }
}

export async function ensureDir() {
  await mkdir(TEAMPULSE_DIR, { recursive: true, mode: 0o700 });
}

export async function readCredentials() {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.server_url || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCredentials(creds) {
  await ensureDir();
  await writeFile(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
  await chmod(CREDENTIALS_PATH, 0o600);
}

async function readDevice() {
  try {
    const raw = await readFile(DEVICE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeDevice(data) {
  await ensureDir();
  await writeFile(DEVICE_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
  await chmod(DEVICE_PATH, 0o600);
}

async function clearDevice() {
  try {
    await unlink(DEVICE_PATH);
  } catch {
    // ignore
  }
}

function generateClaimCode() {
  const raw = randomBytes(3).toString("hex").toUpperCase();
  return `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
}

function generateDeviceSecret() {
  return randomBytes(32).toString("base64url");
}

/**
 * Safely read git global user.email — uses execFileSync (no shell) with
 * hardcoded args, so there's no injection risk.
 */
function getGitEmail() {
  try {
    const out = execFileSync("git", ["config", "--global", "user.email"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    });
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Register a new device with the server. Returns { server_url, claim_code, device_id }.
 * Stores local state in ~/.teampulse/device.json so subsequent polls can prove ownership.
 */
export async function registerDevice(serverUrl = BOOTSTRAP_SERVER_URL) {
  // Reuse an existing pending device if we've already registered.
  const existing = await readDevice();
  if (existing?.claim_code && existing?.device_secret && existing?.server_url === serverUrl) {
    return existing;
  }

  const deviceSecret = generateDeviceSecret();
  const claimCode = generateClaimCode();

  const res = await request(`${serverUrl}/api/v1/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_code: claimCode,
      device_secret: deviceSecret,
      hostname: hostname(),
      os: platform(),
      git_email: getGitEmail(),
    }),
  });

  if (res.statusCode >= 400) {
    throw new Error(`register failed: ${res.statusCode}`);
  }

  const body = await res.body.json();
  const record = {
    server_url: serverUrl,
    device_id: body.device_id,
    claim_code: body.claim_code,
    device_secret: deviceSecret,
  };
  await writeDevice(record);
  return record;
}

/**
 * Poll the claim-code endpoint. Returns status; if approved, persists
 * credentials and returns { status: 'active' }.
 */
export async function pollClaimCode(device) {
  const res = await request(
    `${device.server_url}/api/v1/devices/claim-code/${device.claim_code}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_secret: device.device_secret }),
    }
  );

  if (res.statusCode === 404) {
    return { status: "expired" };
  }
  if (res.statusCode >= 400) {
    return { status: `error_${res.statusCode}` };
  }

  const body = await res.body.json();
  if (body.status === "active" && body.token) {
    await writeCredentials({
      server_url: body.server_url || device.server_url,
      token: body.token,
      user_name: body.user?.name,
      device_id: device.device_id,
    });
    await clearDevice();
  }
  return body;
}

export const paths = {
  TEAMPULSE_DIR,
  CREDENTIALS_PATH,
  DEVICE_PATH,
};
