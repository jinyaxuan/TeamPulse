import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function ActionLink({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "tp-focus-ring inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition duration-200 active:translate-y-px",
        variantClass(variant),
        className
      )}
    >
      {children}
    </Link>
  );
}

export function ActionButton({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
}) {
  return (
    <button
      className={cn(
        "tp-focus-ring inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        variantClass(variant),
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function variantClass(variant: Variant): string {
  if (variant === "primary") return "bg-primary text-primary-foreground shadow-[0_12px_26px_-18px_rgba(0,0,0,0.8)] hover:bg-black/80";
  if (variant === "ghost") return "text-muted-foreground hover:bg-accent hover:text-foreground";
  if (variant === "danger") return "border border-red-200 bg-white text-red-700 hover:bg-red-50";
  return "border border-black/10 bg-white text-foreground shadow-[0_10px_24px_-20px_rgba(0,0,0,0.35)] hover:-translate-y-0.5 hover:bg-surface";
}
