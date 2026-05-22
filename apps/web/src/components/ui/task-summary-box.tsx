import { cn } from "@/lib/utils";

export function TaskSummaryBox({
  summary,
  className,
}: {
  summary: string;
  className?: string;
}) {
  return (
    <div className={cn("mt-2 rounded-[16px] bg-surface px-3 py-2.5", className)}>
      <div className="mb-1 text-[11px] font-medium text-foreground/60">交接摘要</div>
      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-xs leading-5 text-muted-foreground">
        {summary}
      </div>
    </div>
  );
}
