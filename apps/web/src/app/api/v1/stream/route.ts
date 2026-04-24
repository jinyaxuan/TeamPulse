import { getAuthFromRequest } from "@/lib/auth";
import { presenceBus, type PresenceEvent } from "@/lib/presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/stream?project=X
 *
 * Server-Sent Events endpoint. Both the web browser and the MCP server
 * subscribe here. Emits task.started / task.updated / task.ended events
 * scoped to the given project. Sends a keep-alive comment every 25s.
 */
export async function GET(request: Request) {
  const ctx = await getAuthFromRequest(request);
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project");
  if (!projectId) {
    return new Response("project query param required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const channel = `project:${projectId}`;

  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let handler: ((event: PresenceEvent) => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`: connected\n\n`));

      handler = (event: PresenceEvent) => {
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
        } catch {
          // Stream may be closed.
        }
      };
      presenceBus.on(channel, handler);

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          // ignore
        }
      }, 25_000);

      const abort = () => {
        if (handler) presenceBus.off(channel, handler);
        if (keepAlive) clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", abort);
    },
    cancel() {
      if (handler) presenceBus.off(channel, handler);
      if (keepAlive) clearInterval(keepAlive);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
