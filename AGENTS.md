# AGENTS.md — TeamPulse

Operational guide. Next.js 14 + Drizzle ORM + PostgreSQL + Tailwind CSS.

## Build & Validate

```bash
cd apps/web

# Typecheck (primary gate)
npx tsc --noEmit --pretty

# Build (full validation)
TEAMPULSE_SKIP_SWEEP=1 NEXT_DIST_DIR=.next-build DATABASE_URL=postgresql://x:x@localhost/x pnpm next build

# Install deps (pnpm via local install)
export PATH="/home/kindong/.local/node_modules/.bin:$PATH"
pnpm install
```

## Codebase Patterns

- Pages: `apps/web/src/app/<route>/page.tsx` (server components)
- Client components: `"use client"` at top, co-located in same dir
- API routes: `apps/web/src/app/api/v1/<resource>/route.ts`
- Shared lib: `apps/web/src/lib/` (auth.ts, api.ts, env.ts, etc.)
- DB schema: `apps/web/src/db/schema.ts` (Drizzle pgTable)
- Components: `apps/web/src/components/`
- Auth: `getSessionUser()` for pages, `requireAuth()` for API
- Styling: Tailwind CSS with HSL variables, no UI library
- Language: Chinese (zh-CN) for all UI text
- API pattern: `handler()` wrapper from `@/lib/api` with Zod validation

## Git Workflow

- Commit each completed feature
- Message format: `feat:` / `fix:` / `refactor:` prefix
- Push: `git push origin main` (CI auto-deploys)
