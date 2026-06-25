# Refactor Plan Status

This migration is complete.

Evidence Browser now uses the maintained npm workspace layout:

- `packages/api` — Hono API runtime
- `packages/web` — Vite/TanStack web application
- `packages/shared` — shared bundle, URL, and validation logic
- `packages/cli` — `eb` CLI and maintained QA upload helper

The old Next.js staging package has been retired. Do not use it as an
implementation source for new work.

Current implementation references:

- Bundle upload API: `packages/api/src/routes/bundle.ts`
- Bundle manifest validation: `packages/shared/src/bundle/validate-zip.ts`
- URL helpers: `packages/shared/src/url.ts`
- QA upload helper: `packages/cli/scripts/qa-evidence-upload.ts`
- CLI docs: `docs/CLI.md`
