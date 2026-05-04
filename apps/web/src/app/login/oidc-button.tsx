"use client";

import { withBasePath } from "@/lib/base-path";

export function OidcButton() {
  return (
    <a
      href={withBasePath("/api/v1/auth/oidc")}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" rx="96" fill="#6366f1"/>
        <circle cx="256" cy="170" r="30" fill="rgba(255,255,255,0.35)"/>
        <polyline points="80,310 160,310 200,250 240,370 280,220 320,380 360,310 432,310"
          stroke="white" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      统一身份登录
    </a>
  );
}
