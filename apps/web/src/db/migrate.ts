/**
 * Run Drizzle migrations. Used by `pnpm db:migrate` in dev and by the
 * `migrate` init container in production.
 *
 * Dev: loads .env.local first. Prod: expects DATABASE_URL already in env.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function loadDevEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: ".env.local" });
  } catch {
    // dotenv not installed in prod image — that's fine.
  }
}

async function main() {
  await loadDevEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
