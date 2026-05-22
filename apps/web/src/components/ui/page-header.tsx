import { cn } from "@/lib/utils";

type PageHeaderVariant = "standard" | "marvis";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
  variant = "standard",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  variant?: PageHeaderVariant;
}) {
  if (variant === "marvis") {
    return (
      <header className={cn("tp-marvis-stage overflow-hidden rounded-[32px]", className)}>
        <div className="mx-auto max-w-5xl px-6 py-8 text-center sm:px-10 sm:py-10">
          {eyebrow && (
            <div className="mx-auto w-fit rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-white">
              {eyebrow}
            </div>
          )}
          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold text-foreground sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              {description}
            </p>
          )}
          {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
        </div>
        {meta && <div className="px-5 pb-6 sm:px-8">{meta}</div>}
      </header>
    );
  }

  return (
    <header className={cn("tp-marvis-stage overflow-hidden rounded-[32px]", className)}>
      <div className="grid gap-5 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          {eyebrow && (
            <div className="w-fit rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
              {eyebrow}
            </div>
          )}
          <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
      </div>
      {meta && <div className="border-t border-black/5 bg-surface/80 px-6 py-4 sm:px-8">{meta}</div>}
    </header>
  );
}
