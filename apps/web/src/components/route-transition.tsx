"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const transitionKey = search ? `${pathname}?${search}` : pathname;

  return (
    <div key={transitionKey} className="tp-route-transition">
      {children}
    </div>
  );
}
