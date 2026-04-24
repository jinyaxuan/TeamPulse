/**
 * Side-effect module: starts the abandoned-task sweep loop on first import.
 * Imported by `lib/api.ts` so any API route hit triggers it. Safe to import
 * multiple times (idempotent via globalThis guard inside `startSweepLoop`).
 *
 * This runs strictly in the Node runtime because our route handlers do.
 * Edge runtime routes don't import `lib/api.ts`.
 */
import { startSweepLoop } from "./sweep";

startSweepLoop();
