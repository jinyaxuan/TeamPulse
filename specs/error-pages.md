# 错误页面 (Error Pages)

## JTBD
Show professional error pages instead of default Next.js errors, maintaining brand trust.

## Requirements

1. Custom 404 page (`app/not-found.tsx`): "页面未找到" with link to dashboard
2. Custom error boundary (`app/error.tsx`): "出错了" with retry button
3. Match existing design (slate-900 header, card layout)
4. Include helpful navigation links (dashboard, help)

## Acceptance Criteria

- [ ] /nonexistent shows custom 404 with TeamPulse branding
- [ ] Runtime errors show custom error page with retry
- [ ] Both pages are responsive
- [ ] Both pages have links back to dashboard
