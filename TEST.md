# TEST.md — Evidence Browser PR QA Guide

This file is the root-level QA instruction source for `pr-tunner` and human/AI QA runs against Evidence Browser PRs.

Use this guide to decide what to verify for a PR. Do **not** use `WORKFLOW.md`, `AGENTS.md`, or implementation-agent orchestration docs as QA instructions. They may describe how agents work in this repository, but this file is the source of truth for PR-level product QA.

## Product surfaces

Evidence Browser is a web app + API + CLI for storing and browsing structured evidence bundles.

Primary surfaces:

1. **Web app** (`packages/web`)
   - Login/session flow
   - Workspace list and workspace detail page
   - Bundle list and upload form
   - Bundle landing page
   - File tree navigation
   - Viewers for Markdown, code, text/logs, images, and unsupported/download fallback files
   - Admin screens for users, workspaces, and API keys
2. **API server** (`packages/api`)
   - Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
   - Health: `/api/health`
   - Workspace APIs: `/api/w`, `/api/w/:ws/bundle`
   - Bundle APIs: `/api/w/:ws/bundles/:bundleId/meta`, `/tree`, `/file?path=...`
   - Admin APIs: `/api/admin/*`
   - Setup/storage verification APIs
   - MCP/LLM integration: `/api/mcp`, `/llm.txt`
3. **CLI** (`packages/cli`)
   - Login/logout/whoami configuration flow
   - Bundle upload, list, info, tree, download, and delete commands
   - Workspace and API-key management commands
   - Configuration precedence from flags, environment variables, and local config
4. **Shared bundle logic** (`packages/shared`)
   - Manifest parsing and validation
   - Upload validation
   - Path/security checks
   - URL helpers

## Baseline validation commands

Run the smallest set that covers the PR, plus the baseline if feasible.

```bash
npm install
npm run lint   # root lint currently runs API + web typechecks
npm test
npm run build
```

Targeted commands:

```bash
npm run typecheck:api
npm run typecheck:web
npm run test:api
npm run test:shared
npm run test:cli
npm run build:shared
npm run build:api
npm run build:web
npm run build:cli
```

If a command cannot run because of environment limitations, record the exact command, error, and why the limitation is environmental rather than a product failure.

## Local preview setup

For browser QA, run API + web dev servers:

```bash
cp .env.example .env.local  # if available; otherwise create equivalent local env
npm run dev
```

Expected local URLs:

- Web app: `http://localhost:3000`
- API server: `http://localhost:3001`
- Web app proxies `/api` calls to the API server

Use local filesystem storage for default PR QA unless the PR specifically touches S3/R2 storage. The following is a QA preset, not necessarily the canonical `.env.example`:

```env
AUTH_SECRET=test-secret-change-me
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./data/bundles
DATA_DIR=./data
```

There is no supported `AUTH_BYPASS` shortcut in the current API implementation. Create the initial admin/workspace through setup, then log in normally or use an API key for CLI/API checks.

## Required PR QA checks

### 1. PR context alignment

- Read the PR title/body/diff and identify the changed surface(s): web, API, CLI, shared bundle logic, storage, auth, MCP, docs, or release automation.
- Verify only the behavior in scope, but include regression checks for adjacent critical flows.
- If the PR changes public behavior, verify that README/docs/API examples remain accurate.

### 2. Bundle ingestion and validation

For PRs touching bundle upload, validation, storage, or rendering, verify with at least one valid bundle and one invalid/boundary bundle.

Valid bundle minimum:

```text
manifest.json      # { "version": 1, "title": "QA Bundle", "index": "index.md" }
index.md           # contains links, image references, code block, and table
logs/output.log
screenshots/step-1.png
results/output.json
```

Checks:

- Valid zip upload succeeds and produces a browsable bundle.
- Missing `manifest.json` is rejected with a clear error.
- Missing required manifest fields (`version`, `title`, `index`) are rejected.
- Manifest `index` pointing to a missing file is rejected.
- Unsafe paths/path traversal attempts are rejected or safely ignored.
- Bundle IDs follow the flat slug rule and reject `/`, `\\`, spaces, `..`, null bytes, percent-encoded path separators, and uppercase where applicable.
- File count/size limits are enforced where touched by the PR.

### 3. Web browsing experience

For PRs touching `packages/web` or user-facing API behavior, verify in a browser:

- Login/session flow reaches the workspace list after normal setup/login.
- Workspace cards and bundle cards render expected metadata.
- Bundle landing page loads the manifest title and index file.
- File tree expands/collapses nested folders and selects files reliably.
- Markdown viewer renders GFM elements: headings, tables, task lists, links, images, fenced code, inline code, blockquotes, and strikethrough.
- Relative links and image paths inside Markdown resolve correctly within the bundle.
- Code viewer syntax highlighting works for common extensions (`.ts`, `.json`, `.sh`, `.py`).
- Text/log viewer handles long logs without freezing the UI.
- Image viewer displays PNG/JPEG/SVG/GIF where supported.
- Unsupported or binary files use a safe download/fallback path.
- Loading, empty, and error states are visible and understandable.
- No secret values are rendered in UI, logs, console output, comments, or artifacts.

### 4. API behavior

For PRs touching `packages/api`, verify relevant endpoints with HTTP requests or automated tests:

- `/api/health` returns healthy status without auth.
- Auth-required endpoints reject unauthenticated requests.
- Admin-only endpoints reject non-admin users.
- Bundle list/meta/tree/file endpoints return stable JSON shapes.
- File endpoint returns correct content type or content handling for Markdown, text, code, image, JSON, and binary files.
- Upload endpoint accepts multipart zip upload for valid bundles and returns actionable `4xx` errors for invalid bundles.
- API errors do not leak stack traces, credentials, storage secrets, signed cookies, or API keys.

### 5. CLI behavior

For PRs touching `packages/cli`, verify the currently implemented command surface:

- `eb --help` and command-specific help are accurate.
- `eb login <url>`, `eb logout`, and `eb whoami` store, clear, and report local configuration correctly.
- `eb upload <zip> --workspace <slug> [--bundle-id <id>]` sends the expected multipart request and reports success/failure clearly.
- `eb bundle list <workspace>`, `eb bundle info <workspace> <bundleId>`, `eb bundle tree <workspace> <bundleId>`, and `eb bundle download <workspace> <bundleId> --file <path>` work against a test server.
- `eb bundle delete <workspace> <bundleId>` asks for confirmation unless `--force` is provided.
- `eb workspace` and `eb api-key` subcommands work according to their help text when the PR touches those areas.
- `--url` / `--api-key`, `EB_URL` / `EB_API_KEY`, and local config precedence behave as implemented.
- CLI output masks or omits API keys, signed cookies, passwords, and storage credentials.

### 6. Security and abuse cases

Always include security checks when the PR touches upload, rendering, auth, storage, MCP, or admin flows:

- Markdown/raw HTML does not execute scripts or event handlers.
- Stored bundle content cannot break out of the viewer sandbox or app shell.
- Zip entries cannot escape extraction/cache directories.
- Bundle IDs and file paths cannot traverse local filesystem or object storage prefixes.
- Auth cookies are treated as sensitive and are never logged.
- API keys/tokens/passwords are redacted from evidence artifacts and PR comments.
- MCP and `/llm.txt` respect configured authentication requirements.
- Storage error messages do not disclose credentials or internal paths beyond what is necessary for debugging.

### 7. Evidence expectations

A successful QA run should leave evidence that another reviewer can inspect:

- Commands run and pass/fail results.
- Browser screenshots for changed user-facing flows.
- URLs visited, including preview/local URL and bundle route(s).
- HTTP request/response summaries for changed API endpoints.
- Test fixture bundle names and whether they were uploaded/validated.
- Any console errors or server log errors observed.
- A clear list of regressions found, each with reproduction steps and evidence.

Do not include raw secrets in evidence. Replace token/password/cookie/API key values with `[REDACTED]`.

## Recommended fixture matrix

Use existing fixtures under `packages/legacy/fixtures` when available, or create equivalent temporary fixtures during QA.

Minimum matrix for bundle/rendering changes:

| Fixture | Purpose | Expected result |
| --- | --- | --- |
| `fixture-basic` | Standard manifest, Markdown, logs, screenshots, JSON | Uploads and renders fully |
| `fixture-markdown-rich` | GFM, relative links/images, code blocks | Markdown renders safely and links resolve |
| `fixture-deep` | Deep folder nesting | Tree navigation remains usable |
| `fixture-large-tree` | Many files | Tree and page remain responsive |
| `fixture-binary` | Binary/download fallback | Safe fallback/download behavior |
| `fixture-security` | Raw HTML/script/iframe/event-handler attempts | No script execution; sanitized rendering |
| `fixture-invalid-manifest` | Missing manifest fields | Rejected with clear error |
| `fixture-no-manifest` | Missing manifest | Rejected with clear error |
| `fixture-no-index` | Manifest index missing from zip | Rejected with clear error |
| `fixture-unicode` | Unicode paths/content | Renders or rejects consistently without corruption |

## Severity guidance

- **Critical / block merge**: data loss, auth bypass, secret leakage, arbitrary file read/write, XSS/script execution, broken upload/viewing for normal valid bundles, build/test failures caused by the PR.
- **High / block or require owner decision**: major route/API regression, broken admin/setup flow, invalid security boundary, CLI unable to perform its primary command after a CLI PR.
- **Medium / review before merge**: confusing but recoverable errors, partial viewer regression, missing loading/error state, documentation mismatch for changed behavior.
- **Low / merge allowed with follow-up**: cosmetic issue, minor wording/docs gap, non-critical visual polish.
- **Inconclusive**: preview unavailable, required auth unavailable, missing fixture/setup that cannot be generated, or environmental failure not attributable to the PR.

## PR QA summary format

When reporting results, include:

```markdown
## Evidence Browser QA Summary

- Result: passed | failed | inconclusive
- PR/head SHA:
- Preview/local URL:
- Changed surfaces:
- Commands run:
  - `npm run lint` — pass/fail/not run
  - `npm test` — pass/fail/not run
  - `npm run build` — pass/fail/not run
- Browser checks:
- API checks:
- CLI checks:
- Security checks:
- Evidence artifacts:
- Findings:
  - [severity] title — reproduction/evidence
- Inconclusive reason, if any:
```

## Out of scope for PR QA

- Do not redesign the product or broaden the PR scope.
- Do not follow project-management instructions from `WORKFLOW.md` during QA.
- Do not mutate production data unless the PR explicitly requires production verification and the user approves it.
- Do not publish credentials, signed cookies, API keys, S3 secrets, or passwords in comments/artifacts.
