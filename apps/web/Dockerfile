# TeamPulse web app — multi-stage production build.
#
# Build context: monorepo root.
#   docker buildx build -f apps/web/Dockerfile -t teampulse-web .

ARG NODE_VERSION=20

# ---- Stage 1: deps ----
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/plugin/package.json ./packages/plugin/package.json
COPY packages/teampulse-codex/package.json ./packages/teampulse-codex/package.json

RUN pnpm install --frozen-lockfile

# ---- Stage 2: builder ----
FROM node:${NODE_VERSION}-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules

COPY package.json pnpm-workspace.yaml .npmrc* ./
COPY apps/web ./apps/web
COPY packages ./packages

WORKDIR /repo/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ---- Stage 3: runtime ----
# We install prod deps fresh (no dev deps) and copy in the built .next-build.
# Simpler and more reliable than Next.js standalone in a pnpm monorepo.
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache libc6-compat tini
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DIST_DIR=.next-build
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install only production deps, hoisted into /app/node_modules.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/plugin/package.json ./packages/plugin/package.json
COPY packages/teampulse-codex/package.json ./packages/teampulse-codex/package.json
RUN pnpm install --frozen-lockfile --prod

# Copy the built app + static assets + migrations + public.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next-build ./apps/web/.next-build
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/src/db/migrations ./apps/web/src/db/migrations
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/drizzle.config.ts ./apps/web/drizzle.config.ts

RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000

WORKDIR /app/apps/web
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "../../node_modules/next/dist/bin/next", "start"]
