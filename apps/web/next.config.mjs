/** @type {import('next').NextConfig} */
const nextConfig = {
  // Note: we intentionally do NOT use `output: "standalone"` in this monorepo.
  // Next.js's standalone tracer doesn't play well with pnpm workspaces even
  // with node-linker=hoisted — the trace misses key deps. The regular build
  // output runs fine via `next start` against the installed node_modules.
  experimental: {
    serverComponentsExternalPackages: ["postgres", "@node-rs/argon2"],
  },
};

export default nextConfig;
