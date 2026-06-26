---
name: evidence-upload
description: Package a .evidence/{session}/ directory into a ZIP, upload it to Evidence Browser with the eb CLI, and return the bundle URL. Use this whenever an agent or user needs to surface test artifacts, QA runs, debug screenshots, or structured evidence through Evidence Browser's own viewer. This is the canonical high-level upload interface for the project.
argument-hint: <path-to-.evidence/session-dir>
allowed-tools: Bash(zip:*), Bash(rm:*), Bash(node packages/cli/dist/bin.js *), Bash(eb *), Read
---

# /evidence-upload

Upload a prepared `.evidence/{session}/` directory to Evidence Browser and return the viewer URL.

## Who uses this

| Caller | Role |
|---|---|
| `qa-engineer` agent | **Required** — every test run ends with this step to close the recursive loop. |
| `backend-engineer` / `frontend-engineer` agents | **Optional** — use when you want to attach a visual/behavioral artifact to a change. |
| `tech-lead` / `code-reviewer` agents | **Do not use directly.** They read uploaded bundles but do not create them. |
| Human user | `/evidence-upload .evidence/{session}` for manual uploads. |

## Pre-conditions (fail fast if missing)

1. **Server reachable** — `EB_URL` or `--url` must point at Evidence Browser. The wrapper command below maps `QA_BASE_URL` to `EB_URL` for team QA sessions; direct `eb upload` users should set `EB_URL`, pass `--url`, or use `eb login`.
2. **Upload-capable credentials available** — use an API key with `upload` or `admin` scope via `EB_API_KEY` or `--api-key`. Create a key in Admin panel -> API Keys -> Create, or run `eb api-key create --scope upload --workspace default`. An admin session also works at the API layer, but this skill uses the non-interactive CLI path and therefore expects an API key.
3. **CLI built or installed** — prefer `node packages/cli/dist/bin.js`; use global `eb` only when it is known to be installed.
4. **`.evidence/{session}/` directory exists** and contains at minimum:
   - `manifest.json` — `{ "version": 1, "title": "...", "index": "index.md" }`
   - `index.md` — landing page

Schema authority: `packages/shared/src/bundle/validate-zip.ts::validateBundleZip` and `packages/shared/src/bundle/manifest.ts::ManifestSchema`.

## Session ID / bundleId rules

The basename of the directory is used as the `bundleId`. The upload API rejects bundle IDs that contain `/`, `\`, `..`, `\0`, uppercase letters, spaces, or percent-encoded path separators.

Recommended format: `{YYYYMMDD-HHmm}-{branch-slug}-attempt{N}`. Derive `{branch-slug}` from `git rev-parse --abbrev-ref HEAD` with `/` replaced by `-`. See `docs/TEAM_WORKFLOW.md` for the full spec.

## Invocation

Run these commands from the project root, replacing `$ARGUMENTS` with the session directory:

```bash
session_dir="$ARGUMENTS"
bundle_id="$(basename "$session_dir")"
zip_path="/tmp/${bundle_id}.zip"

rm -f "$zip_path"
(cd "$session_dir" && zip -qr "$zip_path" .)

EB_URL="${EB_URL:-${QA_BASE_URL:-http://127.0.0.1:3000}}" \
node packages/cli/dist/bin.js upload "$zip_path" \
  --workspace "${QA_WORKSPACE_SLUG:-default}" \
  --bundle-id "$bundle_id"
```

If `packages/cli/dist/bin.js` does not exist, run `npm run build:cli` first or use the installed `eb upload` binary with the same arguments.

The CLI:

1. Sends the ZIP through `POST /api/w/{workspace}/bundle`.
2. Authenticates with `EB_API_KEY` or `--api-key`.
3. Prints the uploaded bundle ID and a `View:` URL.

Parse the `View:` line from stdout and return it to the caller. On non-zero exit, surface the error verbatim — do not retry automatically.

## Output contract

**Success (exit 0)** — stdout includes:

```text
Uploaded: 20260427-1200-main-attempt1
  View: http://127.0.0.1:3000/w/default/b/20260427-1200-main-attempt1
```

**Failure (exit 1)** — stderr/stdout contains a CLI error. Common causes:

- `Missing API key` → set `EB_API_KEY` or pass `--api-key`.
- `Request failed (401)` → key invalid or expired.
- `Request failed (403)` → key scope is not `upload` or `admin`.
- `Request failed (400)` → `manifest.json` schema invalid; validate against `packages/shared/src/bundle/validate-zip.ts`.
- `Error: File must be a .zip` → package the session directory as a ZIP first.
- `fetch failed` → server not running or `EB_URL`/`QA_BASE_URL` is wrong.

**Usage error (exit 2)** — the caller passed a bad path or invalid CLI arguments.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Missing Evidence Browser URL` | No URL from flags, `EB_URL`, or CLI config | Set `EB_URL`, pass `--url`, or run `eb login`; `QA_BASE_URL` is only mapped by this wrapper snippet |
| `Missing API key` | Non-interactive CLI has no credential | Set `EB_API_KEY` or pass `--api-key` |
| `Request failed (403)` | API key scope insufficient | Use a key with `upload` or `admin` scope |
| `Request failed (413)` | ZIP exceeds `MAX_BUNDLE_SIZE` | Trim the session dir or raise the env cap |
| `Invalid bundle identifier` | Session dir name violates bundleId rules | Rename per the session ID format |
| `packages/cli/dist/bin.js` missing | CLI not built in this checkout | Run `npm run build:cli` |

## Relationship to the `eb` CLI

The `eb` CLI (`evidence-browser-cli` package) is the upload mechanism. This skill is the high-level wrapper that standardizes session directory validation, ZIP packaging, bundleId naming, and URL extraction.

| Layer | Skill | Responsibility |
|-------|-------|----------------|
| High-level | `/evidence-upload` (this skill) | Session directory contract, ZIP packaging, `eb upload` invocation, bundle URL extraction |
| Low-level | `/evidence-browser` | Raw `eb upload` / `eb bundle` / `eb workspace` / `eb api-key` commands |

## References

- `.claude/skills/evidence-browser/SKILL.md` — low-level `eb` CLI reference
- `packages/cli/src/**` — CLI source
- `packages/api/src/routes/bundle.ts` — upload API contract (size cap, bundleId rules, upload auth)
- `packages/api/src/middleware/auth.ts` — `requireUpload` auth scope
- `packages/shared/src/bundle/validate-zip.ts` — manifest schema authority
- `docs/TEAM_WORKFLOW.md` — session ID format, recursive loop spec
