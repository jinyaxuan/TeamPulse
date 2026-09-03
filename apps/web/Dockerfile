# TeamPulse web app — multi-stage production build.
#
# Build context: monorepo root.
#   docker buildx build \
#     -f apps/web/Dockerfile \
#     --build-arg BASE_IMAGE=teampulse-node-base:22-bookworm \
#     --build-arg NEXT_PUBLIC_BASE_PATH=/teampulse \
#     --build-arg PUBLIC_APP_URL=http://118.195.165.111/teampulse \
#     -t teampulse-web .

ARG BASE_IMAGE=teampulse-node-base:22-bookworm
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

# ---- Stage 1: deps ----
FROM ${BASE_IMAGE} AS deps
ARG NPM_CONFIG_REGISTRY
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/plugin/package.json ./packages/plugin/package.json
COPY packages/teampulse-codex/package.json ./packages/teampulse-codex/package.json

RUN NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY}" \
    pnpm install --prefer-offline --frozen-lockfile --network-concurrency 1 --fetch-retries 5 --fetch-retry-factor 2

# ---- Stage 2: builder ----
FROM ${BASE_IMAGE} AS builder
ARG NEXT_PUBLIC_BASE_PATH=
ARG PUBLIC_APP_URL=http://localhost:3000
ARG NPM_CONFIG_REGISTRY
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules

COPY package.json pnpm-workspace.yaml .npmrc* ./
COPY apps/web ./apps/web
COPY packages ./packages

WORKDIR /repo/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV PUBLIC_APP_URL=${PUBLIC_APP_URL}
RUN NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY}" \
    pnpm run build

# ---- Stage 3: runtime ----
# We install prod deps fresh (no dev deps) and copy in the built .next-build.
# Simpler and more reliable than Next.js standalone in a pnpm monorepo.
FROM ${BASE_IMAGE} AS runtime
ARG NEXT_PUBLIC_BASE_PATH=
ARG PUBLIC_APP_URL=http://localhost:3000
ARG NPM_CONFIG_REGISTRY
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DIST_DIR=.next-build
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV PUBLIC_APP_URL=${PUBLIC_APP_URL}
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install only production deps, hoisted into /app/node_modules.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/plugin/package.json ./packages/plugin/package.json
COPY packages/teampulse-codex/package.json ./packages/teampulse-codex/package.json
RUN NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY}" \
    pnpm install --prefer-offline --frozen-lockfile --prod --network-concurrency 1 --fetch-retries 5 --fetch-retry-factor 2

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
CMD ["node", "../../node_modules/next/dist/bin/next", "start"]
