# TEST.md — Evidence Browser PR QA Policy

This file is the authoritative policy for PR-level product QA. Use the PR
title, body, changed files, and diff to identify the affected product surface.
Do not use `WORKFLOW.md`, `AGENTS.md`, or implementation-agent orchestration
documents as QA instructions.

## Goal

Verify that a PR preserves Evidence Browser's primary user journey:

1. The application becomes ready.
2. A workspace can be opened.
3. A valid evidence bundle can be loaded.
4. The bundle landing page and file tree render.
5. Markdown, logs, code, JSON, and images can be inspected safely.

Run this core smoke test for every user-facing PR. Add the targeted checks for
the surfaces changed by the PR.

## Required preparation

Inspect the PR before testing:

```bash
git diff <base-sha>...<head-sha>
git diff --name-only <base-sha>...<head-sha>
```

Record:

- Base and head SHA
- Changed files and product surfaces affected
- Preview or local URL used
- Commands executed

Never include passwords, cookies, API keys, storage credentials, or other
secrets in logs, screenshots, comments, or evidence bundles.

## Automated checks

Run the smallest relevant checks for the changed packages. Run the complete
baseline when the PR crosses package boundaries or changes shared behavior.

```bash
npm run lint
npm test
npm run build
```

Targeted alternatives:

```bash
npm run test:shared
npm run test:api
npm run test:web
npm run test:cli

npm run typecheck:shared
npm run typecheck:api
npm run typecheck:web
npm run typecheck:cli
```

A failure is attributable to the PR only when it reproduces on the PR head and
relates to the changed behavior. Record environmental failures as inconclusive
with the exact command and error.

## Core browser smoke test

Use the provided preview URL when available. For a local run:

```bash
cp .env.example .env.local
npm run dev
```

Expected development URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`

For trusted local QA, `AUTH_BYPASS=true` may be used. Do not use auth bypass
when the PR changes authentication, setup, authorization, or admin behavior.

Use `examples/sample.zip` or `tests/fixtures/evidence/fixture-basic` as the
sample evidence bundle.

Verify:

1. The health endpoint reports a healthy application.
2. The web app loads without an error shell or blank page.
3. A workspace can be opened.
4. The sample bundle can be loaded or uploaded.
5. The bundle page displays its manifest title and index document.
6. The file tree opens nested files.
7. Open and inspect at least one Markdown file, one log or text file, one code
   or JSON file, and one image.
8. Relative Markdown links and embedded images resolve inside the bundle.
9. Navigation does not produce uncaught browser errors.
10. Bundle content does not execute scripts or escape the viewer.

Capture screenshots of the workspace or bundle list and the opened bundle
viewer.

## Targeted checks by changed surface

### Web (`packages/web`)

Verify the changed route or component in the browser, including:

- Loading, empty, and failure states where applicable
- Keyboard or pointer interaction affected by the change
- Browser console errors
- Layout at desktop width and one narrow viewport

### API (`packages/api`)

Exercise each changed endpoint and record its status and response shape. Also
verify:

- `/api/health` remains accessible.
- Protected endpoints reject unauthenticated requests.
- Admin endpoints reject non-admin users.
- Invalid input returns an actionable `4xx` response.
- Errors do not expose stack traces or secrets.

### Shared bundle logic (`packages/shared`)

Test at least one valid and one invalid or boundary input. Bundle identifiers
may use the supported hierarchical format, for example:

```text
org/repo/pr-42/run-1
```

Reject traversal and unsafe values such as `..`, empty path segments,
backslashes, null bytes, and encoded path separators.

### CLI (`packages/cli`)

Always verify the relevant help and validation surface:

```bash
eb --help
eb bundle validate examples/sample.zip
```

When relevant, also test login and configuration, upload, list, info, tree,
download, or delete against the QA server. CLI output must not print API keys,
passwords, cookies, or storage credentials.

### Upload, storage, or rendering

Test one valid bundle, one invalid manifest or missing index, and one unsafe
path or traversal attempt.

A valid bundle must upload and remain browsable. Invalid input must fail with
a clear `4xx` error without creating a partial visible bundle.

## Security regression checks

Run these checks when the PR touches authentication, upload, storage, Markdown,
file serving, MCP, admin functions, or URL/path handling:

- Raw HTML, scripts, event handlers, and unsafe URLs do not execute.
- Zip entries and requested files cannot traverse storage boundaries.
- Unauthorized users cannot read protected bundles.
- Secrets are absent from UI, responses, logs, and evidence.
- Malformed input returns a controlled error instead of a stack trace.

Any authentication bypass, secret exposure, arbitrary file access, stored XSS,
or data loss is merge-blocking.

## Result classification

- `passed`: Required checks completed with no merge-blocking regression.
- `failed`: A reproducible regression attributable to the PR was found.
- `inconclusive`: The preview, credentials, fixture, or required environment
  was unavailable, so testing could not establish a result.

## QA report

```markdown
## Evidence Browser QA Summary

- Result: passed | failed | inconclusive
- PR/head SHA:
- Preview/local URL:
- Changed surfaces:
- Files inspected:
- TEST.md rules considered:

### Commands

- `<command>` — pass | fail | not run

### Core smoke test

- Health:
- Workspace:
- Bundle load/upload:
- Markdown:
- Log/text:
- Code/JSON:
- Image:
- Browser console:

### Targeted and security checks

- Checks performed:
- Checks omitted and reason:

### Evidence

- Screenshots:
- HTTP results:
- Fixture or bundle ID:

### Findings

- `[severity] title` — reproduction steps and evidence

### Inconclusive reason

- Required only when the result is `inconclusive`.
```
