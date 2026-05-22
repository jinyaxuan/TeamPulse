import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("tp-panel overflow-hidden rounded-[24px]", className)}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b border-black/[0.05] bg-white/60 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyPanel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-black/10 bg-white/60 px-4 py-6 text-sm leading-6 text-muted-foreground">
      <div>{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
