/**
 * Interactive admin creation script. Run via `pnpm create-admin`.
 *
 * Inserts a user row with role='admin' and Argon2-hashed password. If a
 * user with that name already exists, prompts whether to reset password
 * and promote them to admin instead.
 *
 * Note: input is shown on the terminal (no echo-masking) to keep things
 * simple — this is a one-time bootstrap script run on the server.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { eq } from "drizzle-orm";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { db, users } from "../src/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  // Non-interactive mode: read from env vars if provided. Useful for automation.
  const envName = process.env.TEAMPULSE_ADMIN_NAME;
  const envEmail = process.env.TEAMPULSE_ADMIN_EMAIL;
  const envPassword = process.env.TEAMPULSE_ADMIN_PASSWORD;
  const envDisplay = process.env.TEAMPULSE_ADMIN_DISPLAY_NAME;
  const nonInteractive = Boolean(envName && envEmail && envPassword);

  try {
    const name = (
      nonInteractive ? envName! : await rl.question("Admin user name (e.g. 'alice'): ")
    ).trim();
    if (!name) throw new Error("name is required");

    const email = (
      nonInteractive ? envEmail! : await rl.question("Admin email: ")
    ).trim();
    if (!email || !email.includes("@")) throw new Error("valid email required");

    const displayName = (
      nonInteractive
        ? envDisplay ?? name
        : (await rl.question(`Display name [${name}]: `)).trim() || name
    ).trim() || name;

    const password = nonInteractive
      ? envPassword!
      : await rl.question("Password (>=8 chars, visible): ");
    if (password.length < 8) throw new Error("password must be at least 8 chars");

    const passwordHash = await hashPassword(password);

    const [existing] = await db.select().from(users).where(eq(users.name, name)).limit(1);

    if (existing) {
      const confirm = nonInteractive
        ? "y"
        : (
            await rl.question(
              `User '${name}' already exists. Reset password and promote to admin? [y/N]: `
            )
          )
            .trim()
            .toLowerCase();
      if (confirm !== "y" && confirm !== "yes") {
        console.log("Aborted.");
        return;
      }
      await db
        .update(users)
        .set({ passwordHash, role: "admin", email, displayName, teamOwnerId: existing.teamOwnerId ?? existing.id })
        .where(eq(users.id, existing.id));
      console.log(`✓ Updated existing user '${name}' as admin.`);
    } else {
      const [created] = await db.insert(users).values({
        name,
        email,
        displayName,
        passwordHash,
        role: "admin",
      }).returning({ id: users.id });
      await db.update(users).set({ teamOwnerId: created.id }).where(eq(users.id, created.id));
      console.log(`✓ Created admin user '${name}'.`);
    }
  } finally {
    rl.close();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
