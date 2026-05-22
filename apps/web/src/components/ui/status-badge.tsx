import { cn } from "@/lib/utils";

type Tone = "slate" | "online" | "agent" | "warning" | "risk" | "info" | "dark";

export function StatusBadge({
  children,
  tone = "slate",
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
        toneClass(tone),
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass(tone))} />}
      {children}
    </span>
  );
}

export function RiskBadge({
  severity,
  children,
}: {
  severity: "none" | "medium" | "high";
  children: React.ReactNode;
}) {
  return (
    <StatusBadge tone={severity === "high" ? "risk" : severity === "medium" ? "warning" : "online"} dot>
      {children}
    </StatusBadge>
  );
}

function toneClass(tone: Tone): string {
  if (tone === "online") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100";
  if (tone === "agent") return "bg-black/[0.04] text-slate-900 ring-1 ring-black/[0.05]";
  if (tone === "warning") return "bg-amber-50/80 text-amber-800 ring-1 ring-amber-100";
  if (tone === "risk") return "bg-red-50 text-red-800 ring-1 ring-red-100";
  if (tone === "info") return "bg-black/[0.04] text-slate-800 ring-1 ring-black/[0.05]";
  if (tone === "dark") return "bg-slate-900 text-white";
  return "bg-black/[0.04] text-slate-700 ring-1 ring-black/[0.04]";
}

function dotClass(tone: Tone): string {
  if (tone === "online") return "bg-online";
  if (tone === "agent") return "bg-agent";
  if (tone === "warning") return "bg-warning";
  if (tone === "risk") return "bg-risk";
  if (tone === "info") return "bg-sky-500";
  return "bg-slate-500";
}
