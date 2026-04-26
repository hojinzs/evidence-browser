---
name: evidence-upload
description: Package a .evidence/{session}/ directory into a ZIP, log in as the QA admin, upload it to the local Evidence Browser instance via POST /api/w/{ws}/bundle, and return the bundle URL. Use this whenever an agent (or user) needs to surface test artifacts, QA runs, debug screenshots, or any structured evidence through Evidence Browser's own viewer. This is the canonical upload interface for the project — do NOT call `packages/legacy/scripts/qa-evidence-upload.ts` directly; go through this skill so pre-conditions, session-ID rules, and manifest validation stay in one place.
argument-hint: <path-to-.evidence/session-dir>
allowed-tools: Bash(npx tsx packages/legacy/scripts/qa-evidence-upload.ts:*), Read
---

# /evidence-upload

Upload a prepared `.evidence/{session}/` directory to the local Evidence Browser and return the viewer URL.

## Who uses this

| Caller | Role |
|---|---|
| `qa-engineer` agent | **Required** — every test run ends with this step to close the recursive loop. |
| `backend-engineer` / `frontend-engineer` agents | **Optional** — use when you want to attach a visual/behavioral artifact to a change (e.g. a before/after screenshot, a reproducer). |
| `tech-lead` / `code-reviewer` agents | **Do not use directly.** They read uploaded bundles but do not create them. |
| Human user (slash command) | `/evidence-upload .evidence/{session}` for manual uploads. |

## Pre-conditions (fail fast if missing)

1. **Local server running** — `http://127.0.0.1:3000` (or `$QA_BASE_URL`) must respond. If not, start it with `npm run dev` in another terminal and retry.
2. **Admin account seeded** — the workspace and admin user must exist. Check by hitting `/setup` in a browser, or use the seed script.
3. **`.env.local` configured** — these variables must be set:
   - `QA_BASE_URL` (default `http://127.0.0.1:3000`)
   - `QA_WORKSPACE_SLUG` (default `default`)
   - `QA_ADMIN_USERNAME` (required — matches `POST /api/auth/login { username }`)
   - `QA_ADMIN_PASSWORD` (required)
4. **`.evidence/{session}/` directory exists** and contains at minimum:
   - `manifest.json` — `{ "version": 1, "title": "...", "index": "index.md" }` (validated by `packages/shared/src/bundle/validate-zip.ts`, re-exported from both runtime extractors)
   - `index.md` — landing page

## Session ID / bundleId rules

The basename of the directory is used as the `bundleId`. The upload API rejects bundleIds that contain `/`, `..`, or `\0`, so the session directory name must not either.

Recommended format: `{YYYYMMDD-HHmm}-{branch-slug}-attempt{N}` — e.g. `20260411-0930-feat-bundle-upload-attempt1`. Derive `{branch-slug}` from `git rev-parse --abbrev-ref HEAD` with `/` replaced by `-`. See `docs/TEAM_WORKFLOW.md` for the full spec.

## Invocation

Run exactly this command from the project root, replacing `$ARGUMENTS` with the path to the session directory:

```bash
npx tsx packages/legacy/scripts/qa-evidence-upload.ts $ARGUMENTS
```

The script:
1. Validates the session directory (manifest + index presence, bundleId safety)
2. Packages it into a ZIP with `archiver` (level 9)
3. Logs in via `POST /api/auth/login` to get a session cookie
4. Uploads via `POST /api/w/{QA_WORKSPACE_SLUG}/bundle` with `file` + `bundleId` form fields
5. Cleans up the temp ZIP
6. Prints a JSON object: `{ "bundleUrl": "http://...", "bundle": { ... } }`

On success, parse `bundleUrl` from stdout and return it to the caller. On non-zero exit, surface the error verbatim — do not retry automatically.

## Output contract

**Success (exit 0)** — stdout ends with:
```json
{
  "bundleUrl": "http://127.0.0.1:3000/w/default/b/{encoded-bundleId}",
  "bundle": { "id": "...", "title": "...", ... }
}
```

**Failure (exit 1)** — stderr contains `[qa-evidence-upload] <reason>`. Common causes:
- `Login failed: 401` → wrong `QA_ADMIN_USERNAME`/`QA_ADMIN_PASSWORD`, or admin account not seeded yet
- `Upload failed: 403` → admin role missing on the account
- `Upload failed: 400 — 번들 검증 실패` → `manifest.json` schema invalid; run `packages/shared/src/bundle/validate-zip.ts::validateBundleZip` locally to see the specific field
- `Missing required file: manifest.json` → session dir is incomplete
- `fetch failed` → server not running

**Usage error (exit 2)** — the caller passed a bad path or session ID.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Login response did not include a set-cookie header` | Login succeeded but cookie format changed | Check `packages/legacy/src/lib/auth/index.ts::SESSION_COOKIE_NAME` still equals `evidence_session` |
| `Invalid session ID "..." : must not contain '/'` | Session dir name has slashes | Rename per the session ID format above |
| `Upload failed: 413` | ZIP exceeds `MAX_BUNDLE_SIZE` | Trim the session dir (drop oversized logs/screenshots) or raise the env cap |
| `ENOENT` on archiver | `archiver` not installed | Already in devDependencies; run `npm install` |

## Relationship to the `eb` CLI

The `eb` CLI (`evidence-browser-cli` package) is now implemented and available via `.claude/skills/evidence-browser/`. The skills form a two-layer stack:

| Layer | Skill | Responsibility |
|-------|-------|----------------|
| High-level | `/evidence-upload` (this skill) | Manifest validation, ZIP packaging, session-ID naming, QA env wiring |
| Low-level | `/evidence-browser` | Raw `eb upload` / `eb bundle` / `eb workspace` / `eb api-key` commands |

**Migration path:** The underlying script `packages/legacy/scripts/qa-evidence-upload.ts` can be replaced with a thin wrapper around `eb upload` when ready. This SKILL.md is the stable interface — only the implementation changes.

## References

- `packages/legacy/scripts/qa-evidence-upload.ts` — current implementation
- `packages/legacy/src/app/api/w/[ws]/bundle/route.ts` — upload API contract (size cap, bundleId rules, admin auth)
- `packages/shared/src/bundle/validate-zip.ts::validateBundleZip` — manifest schema authority
- `docs/TEAM_WORKFLOW.md` — session ID format, recursive loop spec
- `.claude/skills/evidence-browser/SKILL.md` — low-level `eb` CLI reference
