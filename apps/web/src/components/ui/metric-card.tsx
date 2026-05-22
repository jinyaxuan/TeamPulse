import { cn } from "@/lib/utils";

type Tone = "default" | "online" | "agent" | "warning" | "risk";

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  footer,
  className,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: Tone;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("tp-panel overflow-hidden rounded-lg", className)}>
      <div className={cn("h-1", toneBarClass(tone))} />
      <div className="p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 font-mono text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
        {detail && <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>}
        {footer && <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

function toneBarClass(tone: Tone): string {
  if (tone === "online") return "bg-online";
  if (tone === "agent") return "bg-agent";
  if (tone === "warning") return "bg-warning";
  if (tone === "risk") return "bg-risk";
  return "bg-slate-400";
}
