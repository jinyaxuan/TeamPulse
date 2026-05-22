"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type NavigationProgressContextValue = {
  isNavigating: boolean;
  start: () => void;
};

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null);

export function NavigationProgressProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    setIsNavigating(false);
  }, [routeKey]);

  useEffect(() => {
    if (!isNavigating) return;
    const timeout = window.setTimeout(() => setIsNavigating(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [isNavigating]);

  const start = useCallback(() => {
    setIsNavigating(true);
  }, []);

  const value = useMemo(() => ({ isNavigating, start }), [isNavigating, start]);

  return (
    <NavigationProgressContext.Provider value={value}>
      <div className="tp-navigation-progress" data-active={isNavigating ? "true" : "false"} aria-hidden="true" />
      {children}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress() {
  return useContext(NavigationProgressContext);
}

export function ProgressLink({
  href,
  onClick,
  ...props
}: React.ComponentProps<typeof Link>) {
  const progress = useNavigationProgress();

  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && isInternalHref(href) && event.currentTarget.href !== window.location.href) {
          progress?.start();
        }
      }}
      {...props}
    />
  );
}

function isInternalHref(href: React.ComponentProps<typeof Link>["href"]) {
  if (typeof href !== "string") return true;
  if (href.startsWith("#")) return false;
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) return false;
  return true;
}
