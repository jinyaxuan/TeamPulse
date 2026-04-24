/**
 * Next.js instrumentation hook. Intentionally empty in V1 — the bundler
 * traces all imports through here including our DB client, which isn't
 * Edge-safe. We start the abandoned-task sweep loop lazily on the first
 * API route hit instead (see src/lib/sweep-bootstrap.ts).
 */
export async function register() {
  // No-op. See src/lib/sweep-bootstrap.ts.
}
