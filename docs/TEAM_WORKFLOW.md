# Team Workflow

This is the canonical spec for how the Claude Code sub-agent team operates on this project. `AGENTS.md` summarizes this file — if they disagree, this file wins.

## Agent roster

| Agent | File | Skill used | Domain |
|-------|------|------------|--------|
| `tech-lead` | `.claude/agents/tech-lead.md` | — | Triage, decomposition, dispatch, recursive loop coordination |
| `backend-engineer` | `.claude/agents/backend-engineer.md` | `/codex:rescue` | API routes, DB, auth, storage, MCP, bundle pipeline, scripts |
| `frontend-engineer` | `.claude/agents/frontend-engineer.md` | `/frontend-design` | Pages, layouts, components, Tailwind, globals.css, Figma integration |
| `code-reviewer` | `.claude/agents/code-reviewer.md` | — | Diff review + security checklist between impl and QA |
| `qa-engineer` | `.claude/agents/qa-engineer.md` | — | TC design, Playwright MCP, evidence bundling, upload, recursive verification |
| `release-notes-writer` | `.claude/agents/release-notes-writer.md` | — | AGENTS.md / README / CHANGELOG after a cycle |

## Standard flow

```
┌─────────────────────────────────────────────────────────────────┐
│ user request                                                    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                          ┌───────▼────────┐
                          │   tech-lead    │  classify + decompose
                          └───┬────────┬───┘
                              │        │
                ┌─────────────┘        └────────────┐
                │                                   │
        ┌───────▼────────┐                 ┌────────▼─────────┐
        │ backend-       │                 │ frontend-        │
        │ engineer       │                 │ engineer         │
        │ (/codex:rescue)│                 │ (/frontend-design)│
        └───────┬────────┘                 └────────┬─────────┘
                │                                   │
                └───────────────┬───────────────────┘
                                │
                        ┌───────▼────────┐
                        │ code-reviewer  │  diff + security checklist
                        └───┬────────┬───┘
                            │        │
                      PASS  │        │  FAIL
                            │        │
                            │        └──► bounce back to tech-lead
                            │
                    ┌───────▼────────┐
                    │  qa-engineer   │  TCs + browser + evidence + upload + verify
                    └───┬────────┬───┘
                        │        │
                  PASS  │        │  FAIL (attempt N < 3)
                        │        │
                        │        └──► tech-lead → re-dispatch → attempt N+1
                        │
                ┌───────▼────────┐
                │ release-notes- │  AGENTS.md, README, CHANGELOG
                │ writer         │
                └───────┬────────┘
                        │
                        ▼
                     done
```

## `.evidence/{session}/` layout

Every QA run produces a directory under `.evidence/`. This directory is git-ignored and re-created per attempt.

```
.evidence/{session}/
├── manifest.json          # Evidence Browser bundle manifest (required)
├── index.md               # Landing page with summary + navigation (required)
├── tc/
│   ├── tc-001-happy-path.md
│   ├── tc-002-edge-oversized-zip.md
│   └── ...
├── results/
│   ├── vitest.json        # `vitest run --reporter=json`
│   ├── playwright.json    # `playwright --reporter=json` (if applicable)
│   ├── summary.md         # Pass/fail counts + narrative
│   └── final-status.md    # Only on final attempt after loop stops
├── screenshots/
│   ├── tc-001-before.png
│   ├── tc-001-after.png
│   └── ...
├── logs/
│   ├── server.log
│   └── build.log
└── review.md              # Copy of code-reviewer output
```

### Session ID format

```
{YYYYMMDD-HHmm}-{branch-slug}-attempt{N}
```

- `YYYYMMDD-HHmm`: UTC timestamp when the attempt starts
- `branch-slug`: `git rev-parse --abbrev-ref HEAD` with `/` replaced by `-`
- `attempt{N}`: 1, 2, or 3

Example: `20260410-1430-feat-bundle-upload-attempt1`

**Constraints** — the session ID doubles as the `bundleId` for upload, so it must not contain:
- `/` or `\`
- `..`
- `\0`
- spaces
- uppercase letters
- percent-encoded input such as `%2F`

### `manifest.json` minimum

```json
{
  "version": 1,
  "title": "QA Run: {session}",
  "index": "index.md"
}
```

Schema authority: `packages/shared/src/bundle/validate-zip.ts::validateBundleZip`. Both runtime extractor modules re-export that shared validator, so the schema SSOT lives in `packages/shared`.

## Upload API contract

`POST /api/w/{ws}/bundle` (served by `packages/api/src/routes/bundle.ts`; in local dev this is reached via the web dev proxy at `http://127.0.0.1:3000/api/...`)

- **Auth**: admin session cookie required (`requireAdminFromRequest`)
- **Body**: multipart form data
  - `file` — ZIP file, must end with `.zip`
  - `bundleId` — optional; defaults to filename stem; must match the flat slug rule (`^[a-z0-9][a-z0-9._-]{0,127}$`)
- **Size cap**: `MAX_BUNDLE_SIZE` env (default 500MB)
- **Response**: `{ bundle: { ... } }` on 201, or `{ error: "..." }` on 4xx

### Canonical upload interface: `/evidence-upload` skill

Agents **must** upload through the `/evidence-upload` skill (`.claude/skills/evidence-upload/SKILL.md`), not by calling the script directly. The skill currently wraps `packages/legacy/scripts/qa-evidence-upload.ts`, which handles login + ZIP + POST in one step against the current API runtime.

**Why the skill layer**: `packages/legacy/scripts/qa-evidence-upload.ts` is the **precursor implementation** of the future `eb bundle create` + `eb bundle upload` commands defined in `docs/CLI.md`. When the `eb` CLI lands:

- The script can be replaced with a thin call to `eb`
- The skill interface (`/evidence-upload <dir>`) stays stable
- No agent spec needs to change

Routing every upload through the skill keeps the agent contracts decoupled from the current script and lets the implementation swap out cleanly.

### bundleId convention

The team workflow uses flat, lowercase bundle IDs by default. Recommended formats:

- `{YYYYMMDD-HHmm}-{branch-slug}-attempt{N}`
- `pr-{number}-run-{runNumber}`

Examples:

- `20260410-1430-feat-bundle-upload-attempt1`
- `pr-42-run-17`

## Recursive loop state machine

```
state: attempt = 1

loop:
  qa-engineer.runAttempt(attempt)
    → build .evidence/{session}/ where session includes "attempt{N}"
    → run TCs + edge cases
    → upload via /evidence-upload skill (legacy helper script under the hood for now)
    → open uploaded bundle URL via Playwright MCP
    → verify render

  if all verifications pass:
    report success with bundle URL
    exit loop

  if any verification fails:
    if attempt < 3:
      tech-lead.routeFix(failure)   # BE for logic, FE for UI
      code-reviewer.review()
      attempt += 1
      continue loop

    if attempt == 3:
      write .evidence/{session}/results/final-status.md
      upload final bundle
      report failure to user with remaining defects
      exit loop (human judgment required)
```

## Handoff artifacts (per phase)

| Phase | Artifact | Location |
|-------|----------|----------|
| BE impl | commit(s) + file list | git history |
| FE impl | commit(s) + file list + visual screenshots | git + `.evidence/{session}/screenshots/` (if QA running) |
| code-reviewer | review report | `.evidence/{session}/review.md` |
| qa-engineer | evidence bundle | `.evidence/{session}/` + uploaded bundle URL |
| release-notes-writer | doc updates | `AGENTS.md`, `README.md`, `CHANGELOG.md` edits in git |

## Pre-conditions

Before the team can operate:

1. **Local Evidence Browser runnable**: `npm run dev` succeeds and serves `http://127.0.0.1:3000` (web) with API proxy to `http://127.0.0.1:3001`
2. **Admin account exists**: run setup wizard at `/setup` on first boot, or `POST /api/setup/admin`
3. **Workspace exists**: default slug is `default`; create via setup wizard or admin panel
4. **`.env.local` is configured**:
   - `AUTH_SECRET` — random 32-byte base64
   - `QA_ADMIN_USERNAME` — admin account username (matches login API field name)
   - `QA_ADMIN_PASSWORD` — admin account password
   - `QA_WORKSPACE_SLUG` — default `default`
   - `QA_BASE_URL` — default `http://127.0.0.1:3000`
5. **Playwright MCP available**: `mcp__plugin_playwright_playwright__*` tools enabled

If any pre-condition is missing, the agent should fail fast and tell the user rather than attempt to bootstrap.

## References

- `.claude/agents/*.md` — agent specs
- `packages/legacy/scripts/qa-evidence-upload.ts` — temporary upload helper used by the skill until CLI upload commands land
- `packages/shared/src/bundle/validate-zip.ts` — manifest schema authority
- `packages/api/src/routes/bundle.ts` — upload API contract for `POST /api/w/{ws}/bundle`
- `docs/DESIGN_GUIDE.md` — frontend SSOT
- `packages/legacy/playwright.config.ts` — legacy E2E pattern reference
- `/home/hojinzs/.claude/plans/snoopy-wobbling-brooks.md` — original team setup plan
