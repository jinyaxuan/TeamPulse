import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy singleton: initialize on first use, not at import time.
// This lets scripts load dotenv before our db module resolves DATABASE_URL.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function init() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  _client = postgres(url, {
    max: 10,
    idle_timeout: 30,
  });
  _db = drizzle(_client, { schema });
}

// Proxy so `import { db } from "@/db"` keeps working; the actual client is
// created on the first property access.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) init();
    return Reflect.get(_db as object, prop);
  },
});

export * from "./schema";
