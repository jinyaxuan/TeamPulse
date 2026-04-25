import { sql, type SQL } from "drizzle-orm";
import { projects, users } from "@/db";

export const SHOW_TEST_DATA_PARAM = "showTestData";

export function shouldShowTestData(value: string | null | undefined): boolean {
  return value === "1";
}

export function nonTestProjectCondition(): SQL {
  return sql`(${projects.displayName} IS NULL OR ${projects.displayName} NOT LIKE 'test/e2e_%')`;
}

export function nonTestUserCondition(): SQL {
  return sql`${users.name} NOT LIKE 'e2e_%'`;
}
