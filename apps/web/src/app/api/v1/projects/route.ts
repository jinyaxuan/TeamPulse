import { handler, json, requireAuth } from "@/lib/api";
import { listProjectsWithStats } from "@/lib/project-stats";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/projects
 * List all projects with their latest activity timestamp and active member count.
 */
export const GET = handler(async (request) => {
  await requireAuth(request);
  const projects = await listProjectsWithStats();
  return json({ projects });
});
