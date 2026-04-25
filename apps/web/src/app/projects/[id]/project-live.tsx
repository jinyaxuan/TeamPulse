"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to SSE for the given project and triggers a server-component
 * refresh when task or message events arrive. Also shows a small live status dot.
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
      setLastEvent(`${eventLabel(type)} · ${new Date().toLocaleTimeString("zh-CN")}`);
      router.refresh();
      void e;
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    es.addEventListener("task.started", handle("task.started"));
    es.addEventListener("task.updated", handle("task.updated"));
    es.addEventListener("task.ended", handle("task.ended"));
    es.addEventListener("message.created", handle("message.created"));

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
        aria-label={connected ? "实时连接正常" : "实时连接断开"}
      />
      {connected ? "实时更新已连接" : "实时更新离线"}
      {lastEvent && <span className="ml-2">· 最近事件：{lastEvent}</span>}
    </div>
  );
}

function eventLabel(type: string): string {
  switch (type) {
    case "task.started":
      return "任务开始";
    case "task.updated":
      return "任务更新";
    case "task.ended":
      return "任务结束";
    case "message.created":
      return "新消息";
    default:
      return type;
  }
}
