#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir, hostname, platform } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0] || "help";
const teampulseDir = join(homedir(), ".teampulse");
const devicePath = join(teampulseDir, "device.json");
const credentialsPath = join(teampulseDir, "credentials.json");

async function main() {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "register":
      await register();
      return;
    case "poll":
      await poll();
      return;
    case "status":
      await status();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  process.stdout.write(`TeamPulse agent connector

Usage:
  node scripts/teampulse-connect.mjs register --server-url http://localhost:3002
  node scripts/teampulse-connect.mjs poll --server-url http://localhost:3002
  node scripts/teampulse-connect.mjs status

Credentials are stored in ${credentialsPath}.
`);
}

async function register() {
  const serverUrl = normalizedServerUrl();
  const existing = await readJson(devicePath);
  if (existing?.server_url === serverUrl && existing?.claim_code && existing?.device_secret) {
    writeJson({
      status: "pending",
      reused: true,
      server_url: existing.server_url,
      device_id: existing.device_id,
      claim_code: existing.claim_code,
      next_step: `Open ${serverUrl}/settings/connect and bind this claim code, then run poll.`,
    });
    return;
  }

  const body = await postJson(`${serverUrl}/api/v1/devices/register`, {
    hostname: hostname(),
    os: platform(),
    git_email: gitEmail(),
  });

  if (!body.claim_code || !body.device_secret || !body.device_id) {
    throw new Error("register response missing claim_code, device_secret, or device_id");
  }

  await ensureDir();
  await writeFile(
    devicePath,
    JSON.stringify(
      {
        server_url: serverUrl,
        device_id: body.device_id,
        claim_code: body.claim_code,
        device_secret: body.device_secret,
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  await chmod(devicePath, 0o600);

  writeJson({
    status: "pending",
    server_url: serverUrl,
    device_id: body.device_id,
    claim_code: body.claim_code,
    next_step: `Open ${serverUrl}/settings/connect and bind this claim code, then run poll.`,
  });
}

async function poll() {
  const serverUrl = normalizedServerUrl();
  const device = await readJson(devicePath);
  if (!device?.claim_code || !device?.device_secret) {
    throw new Error(`No pending device found at ${devicePath}. Run register first.`);
  }
  if (device.server_url && device.server_url !== serverUrl) {
    throw new Error(`Pending device was registered for ${device.server_url}; use that --server-url.`);
  }

  const body = await postJson(
    `${serverUrl}/api/v1/devices/claim-code/${encodeURIComponent(device.claim_code)}`,
    { device_secret: device.device_secret }
  );

  if (body.status === "active" && body.token) {
    await ensureDir();
    await writeFile(
      credentialsPath,
      JSON.stringify(
        {
          server_url: body.server_url || serverUrl,
          token: body.token,
          user_name: body.user?.name,
          device_id: device.device_id,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
    await chmod(credentialsPath, 0o600);
    await unlink(devicePath).catch(() => {});
    writeJson({
      status: "configured",
      server_url: body.server_url || serverUrl,
      user_name: body.user?.name,
      device_id: device.device_id,
      credentials_path: credentialsPath,
    });
    return;
  }

  writeJson({
    status: body.status || "pending",
    claim_code: device.claim_code,
    next_step:
      body.status === "pending"
        ? `Open ${serverUrl}/settings/connect and bind this claim code.`
        : undefined,
  });
}

async function status() {
  const credentials = await readJson(credentialsPath);
  if (credentials?.server_url && credentials?.token) {
    writeJson({
      configured: true,
      server_url: credentials.server_url,
      user_name: credentials.user_name,
      device_id: credentials.device_id,
      credentials_path: credentialsPath,
    });
    return;
  }

  const pending = await readJson(devicePath);
  writeJson({
    configured: false,
    credentials_path: credentialsPath,
    pending_device: pending
      ? {
          server_url: pending.server_url,
          device_id: pending.device_id,
          claim_code: pending.claim_code,
        }
      : null,
  });
}

function normalizedServerUrl() {
  const value = option("server-url") || process.env.TEAMPULSE_SERVER_URL || "http://localhost:3002";
  return value.replace(/\/+$/, "");
}

function option(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

async function ensureDir() {
  await mkdir(teampulseDir, { recursive: true, mode: 0o700 });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status} from ${url}`);
  }
  return data;
}

function gitEmail() {
  try {
    const out = execFileSync("git", ["config", "--global", "user.email"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.message || err}\n`);
  process.exit(1);
});
