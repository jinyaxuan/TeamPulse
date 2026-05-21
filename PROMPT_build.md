# Building Mode — TeamPulse Commercialization

## Instructions

0a. Study `specs/*` to learn the feature specifications.
0b. Study @IMPLEMENTATION_PLAN.md for the prioritized task list.
0c. The application source code is in `apps/web/src/*`. Read @AGENTS.md for build commands.

1. Choose the **first PENDING item** in @IMPLEMENTATION_PLAN.md. Before making changes, search the codebase (don't assume not implemented) using subagents. Implement the feature completely.

2. After implementing, run validation:
   ```bash
   cd apps/web && npx tsc --noEmit --pretty
   ```
   If typecheck fails, fix the errors. Then run the full build:
   ```bash
   TEAMPULSE_SKIP_SWEEP=1 NEXT_DIST_DIR=.next-build DATABASE_URL=postgresql://x:x@localhost/x pnpm next build
   ```

3. When the build passes, update @IMPLEMENTATION_PLAN.md: mark the item as `[DONE]` and move it to the Completed section.

4. `git add` the changed files (specific files, not -A), then `git commit` with the commit message specified in the plan. Include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`. Then `git push origin main`.

5. After the commit, output `RALPH_DONE` to signal this iteration is complete.

## Guardrails

99999. All UI text must be in Chinese (zh-CN). Match existing patterns in the codebase.

999999. Follow existing code patterns exactly: use `handler()` wrapper for API routes, `getSessionUser()` for page auth, Tailwind classes matching the existing design system.

9999999. Keep @IMPLEMENTATION_PLAN.md current — mark items done, add discoveries.

99999999. One feature per iteration. Do NOT implement multiple plan items at once.

999999999. Never modify files unrelated to the current task. No cleanup, no refactoring beyond scope.

9999999999. Typecheck MUST pass before committing. Build MUST pass before pushing.
