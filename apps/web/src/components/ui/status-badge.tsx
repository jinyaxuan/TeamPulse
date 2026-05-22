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
        "inline-flex w-fit flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
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
  if (tone === "online") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  if (tone === "agent") return "bg-teal-50 text-teal-800 ring-1 ring-teal-200";
  if (tone === "warning") return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  if (tone === "risk") return "bg-red-50 text-red-800 ring-1 ring-red-200";
  if (tone === "info") return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
  if (tone === "dark") return "bg-slate-900 text-white";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function dotClass(tone: Tone): string {
  if (tone === "online") return "bg-online";
  if (tone === "agent") return "bg-agent";
  if (tone === "warning") return "bg-warning";
  if (tone === "risk") return "bg-risk";
  if (tone === "info") return "bg-sky-500";
  return "bg-slate-500";
}
