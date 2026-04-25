/**
 * Next.js instrumentation hook. Intentionally empty in V1 — the bundler
 * traces all imports through here including our DB client, which isn't
 * Edge-safe. We start the abandoned-task sweep loop lazily on the first
 * API route hit instead (see src/lib/sweep-bootstrap.ts). The build script
 * disables that lazy bootstrap while Next.js analyzes route modules.
 */
export async function register() {
  // No-op. See src/lib/sweep-bootstrap.ts.
}
