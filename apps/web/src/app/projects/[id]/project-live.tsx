"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to SSE for the given project and triggers a server-component
 * refresh when task events arrive. Also shows a small "live" status dot.
 */
export function ProjectLiveUpdates({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/v1/stream?project=${projectId}`);
    const onOpen = () => setConnected(true);
    const onError = () => setConnected(false);
    const handle = (type: string) => (e: MessageEvent) => {
      setLastEvent(`${type} @ ${new Date().toLocaleTimeString()}`);
      router.refresh();
      void e;
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    es.addEventListener("task.started", handle("task.started"));
    es.addEventListener("task.updated", handle("task.updated"));
    es.addEventListener("task.ended", handle("task.ended"));

    return () => {
      es.close();
    };
  }, [projectId, router]);

  return (
    <div className="text-xs text-muted-foreground">
      <span
        className={
          "mr-2 inline-block h-2 w-2 rounded-full " +
          (connected ? "bg-green-500" : "bg-gray-400")
        }
        aria-label={connected ? "live" : "disconnected"}
      />
      {connected ? "Live updates connected" : "Offline"}
      {lastEvent && <span className="ml-2">· last: {lastEvent}</span>}
    </div>
  );
}
