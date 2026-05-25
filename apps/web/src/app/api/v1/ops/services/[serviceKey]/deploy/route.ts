import { z } from "zod";
import { ApiError, handler, json, parseBody, requireAdminAuth } from "@/lib/api";
import { getOpsService } from "@/lib/ops/catalog";
import { dispatchWorkflow, OpsIntegrationError } from "@/lib/ops/gitea";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deploySchema = z.object({
  ref: z.string().min(1).max(128).optional(),
});

type Params = {
  serviceKey: string;
};

export const POST = handler<Params>(async (request, params) => {
  await requireAdminAuth(request);
  const body = await parseBody(request, deploySchema);
  const service = getOpsService(params.serviceKey);
  if (!service) {
    throw new ApiError("服务不存在", 404);
  }

  try {
    await dispatchWorkflow(service, body.ref);
  } catch (error) {
    if (error instanceof OpsIntegrationError) {
      throw new ApiError(error.message, error.status);
    }
    throw error;
  }

  return json({
    ok: true,
    service: service.key,
    workflow: service.workflow,
    ref: body.ref ?? service.ref,
  });
});
