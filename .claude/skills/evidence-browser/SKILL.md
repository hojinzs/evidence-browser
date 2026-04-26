---
name: evidence-browser
description: Interact with an Evidence Browser instance via the `eb` CLI — upload bundle ZIPs, inspect bundles and workspaces, and manage API keys. Use this skill whenever an agent needs to push or query Evidence Browser artifacts programmatically. Non-interactive: authentication must be supplied via env vars or flags, not via `eb login`. The `/evidence-upload` skill delegates its upload step here.
argument-hint: <subcommand> [args]
allowed-tools: Bash(node packages/cli/dist/bin.js *), Bash(eb *), Read
---

# /evidence-browser

Low-level CLI primitive for the Evidence Browser REST API. Agents call this directly; higher-level skills (e.g. `/evidence-upload`) wrap it.

## Quick reference

```
eb upload <file.zip>  --workspace <slug>  [--bundle-id <id>]  [--url <url>]  [--api-key <key>]
eb bundle  list   <workspace>
eb bundle  info   <workspace> <bundleId>
eb bundle  tree   <workspace> <bundleId>
eb bundle  download <workspace> <bundleId>  --file <path-in-bundle>
eb bundle  delete <workspace> <bundleId>    [--force]
eb workspace list
eb workspace create <slug> <name>           [--description <text>]
eb workspace update <slug>                  [--name <name>] [--description <text>]
eb workspace delete <slug>                  [--force]
eb api-key list                             [--admin]
eb api-key create <name>  --scope <read|upload|admin>
eb api-key delete <keyId>
```

Interactive-only (human use, never call from agents):
```
eb login  [url]    # prompts for API key; writes ~/.config/evidence-browser/config.json
eb logout          # removes config file
eb whoami          # shows current auth status
```

## Authentication priority (resolved per-command)

1. `--api-key <key>` flag
2. `EB_API_KEY` environment variable
3. `~/.config/evidence-browser/config.json` (`apiKey` field, written by `eb login`)

Same priority for the server URL: `--url` → `EB_URL` → config file `url` field.

**Agents must use env vars or flags.** `eb login` is interactive (reads from TTY) and must not be called from non-interactive contexts.

## Invocation

`eb` ships as the binary of the `evidence-browser-cli` npm package. Inside this project, invoke it directly from the built output:

```bash
node packages/cli/dist/bin.js <subcommand> [args]
```

If the CLI is installed globally (`npm install -g evidence-browser-cli`) you can call `eb` directly instead.

To rebuild after source changes:

```bash
npm run build --workspace=packages/cli
```

## Common agent workflow — upload a bundle

```bash
# 1. Build a .evidence/{session}/ directory with at least manifest.json + index.md
# 2. Package it into a ZIP (archiver or zip CLI)
zip -r /tmp/my-bundle.zip .evidence/20260427-1200-main-attempt1/

# 3. Upload — supply URL + key via env vars
EB_URL=http://127.0.0.1:3000 \
EB_API_KEY=<key> \
node packages/cli/dist/bin.js upload /tmp/my-bundle.zip \
  --workspace default \
  --bundle-id 20260427-1200-main-attempt1
```

On success the CLI prints:
```
Uploaded: 20260427-1200-main-attempt1
  View: http://127.0.0.1:3000/w/default/20260427-1200-main-attempt1
```

Parse the `View:` line for the bundle URL to return to the caller.

On non-zero exit, surface the error verbatim — do not retry automatically.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (API error, auth failure, file not found) |
| 2 | Usage error (missing required argument or flag) |

## Common error messages

| Message | Cause | Fix |
|---------|-------|-----|
| `Missing Evidence Browser URL` | No URL from any source | Pass `--url` or set `EB_URL` |
| `Missing API key` | No key from any source | Pass `--api-key` or set `EB_API_KEY` |
| `Request failed (401)` | Key invalid or expired | Rotate the key via `eb api-key create` |
| `Request failed (403)` | Key scope insufficient | Use a key with the required scope (`upload` or `admin`) |
| `Request failed (400)` | Bundle validation failed | Check `manifest.json` schema against `packages/shared/src/bundle/validate-zip.ts::validateBundleZip` |
| `Error: File must be a .zip` | Non-ZIP file passed to `upload` | Package the session dir as a `.zip` first |

## Bundle ID rules

The bundleId is derived from the ZIP filename (stem) when `--bundle-id` is omitted. The server rejects IDs containing `/`, `..`, or `\0`. Use the project-standard format:

```
{YYYYMMDD-HHmm}-{branch-slug}-attempt{N}
```

Derive `{branch-slug}` from `git rev-parse --abbrev-ref HEAD` with `/` replaced by `-`.

## Relationship to other skills

| Skill | Role |
|-------|------|
| `/evidence-upload` | **Higher-level wrapper.** Handles manifest validation, ZIP packaging, login flow, and session-ID naming. Delegates the actual HTTP upload to `eb upload` (or the legacy script). Prefer `/evidence-upload` when you have a `.evidence/{session}/` directory to publish. |
| `/evidence-browser` (this skill) | **Lower-level primitive.** Use directly when you need fine-grained control: inspecting bundles, managing workspaces, rotating API keys, or uploading a pre-packaged ZIP you've assembled yourself. |

## References

- `packages/cli/src/` — CLI source (TypeScript)
- `packages/cli/dist/bin.js` — compiled entry point
- `packages/legacy/src/app/api/w/[ws]/bundle/route.ts` — upload API contract (size cap, bundleId rules)
- `packages/shared/src/bundle/validate-zip.ts` — manifest schema authority
- `docs/TEAM_WORKFLOW.md` — session ID format, recursive QA loop spec
- `docs/CLI.md` — original CLI design spec
