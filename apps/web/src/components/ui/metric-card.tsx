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
    <div className={cn("tp-panel overflow-hidden rounded-[24px] transition duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_28px_70px_-50px_rgba(15,23,42,0.42)]", className)}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className={cn("h-1.5 w-10 rounded-full", toneBarClass(tone))} />
          <div className={cn("h-2 w-2 rounded-full", toneDotClass(tone))} />
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 font-mono text-3xl font-semibold text-foreground sm:text-4xl">
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

function toneDotClass(tone: Tone): string {
  if (tone === "online") return "bg-online/70";
  if (tone === "agent") return "bg-agent/70";
  if (tone === "warning") return "bg-warning/70";
  if (tone === "risk") return "bg-risk/70";
  return "bg-slate-400/70";
}
