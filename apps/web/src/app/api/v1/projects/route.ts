import { handler, json, requireAuth } from "@/lib/api";
import { listProjectsWithStats } from "@/lib/project-stats";
import { shouldShowTestData, SHOW_TEST_DATA_PARAM } from "@/lib/test-data";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/projects
 * List all projects with their latest activity timestamp and active member count.
 */
export const GET = handler(async (request) => {
  const ctx = await requireAuth(request);
  const url = new URL(request.url);
  const projects = await listProjectsWithStats({
    user: ctx.user,
    includeTestData: shouldShowTestData(url.searchParams.get(SHOW_TEST_DATA_PARAM)),
  });
  return json({ projects });
});
