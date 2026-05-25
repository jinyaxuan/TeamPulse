import { handler, json, requireAdminAuth } from "@/lib/api";
import { opsServices } from "@/lib/ops/catalog";
import { getWorkflowState } from "@/lib/ops/gitea";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await requireAdminAuth(request);

  const services = await Promise.all(
    opsServices.map(async (service) => ({
      ...service,
      workflowState: await getWorkflowState(service),
    }))
  );

  return json({ services });
});
