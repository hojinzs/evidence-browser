# Evidence Browser Architecture

> Last updated: 2026-06-26
> This document reflects the maintained Hono + Vite workspace architecture. The retired Next.js monolith is not part of the live build or deploy path.

---

## 1. Runtime Shape

```text
Browser
  |
  | HTML/CSS/JS from root ./web after npm run build
  v
Vite + React + TanStack Router SPA
  |
  | /api/* fetches
  v
Hono app (packages/api/src/app.ts)
  |-- /api/auth
  |-- /api/w
  |-- /api/s
  |-- /api/api-keys
  |-- /api/admin
  |-- /api/setup
  |-- /api/mcp
  `-- /api/health
       |
       | DB, auth, storage, bundle extraction, MCP tools
       v
SQLite + local filesystem or S3/R2 bundle storage
```

`packages/api/src/server.ts` starts the Hono app with `@hono/node-server`. In production builds, the root `npm run build` script builds `packages/web`, copies `packages/web/dist` to root `web/`, and the Hono app serves that directory with an SPA fallback to `index.html`.

---

## 2. Workspace Layout

```text
packages/
  api/
    src/
      app.ts                 # Hono route assembly + static web serving
      server.ts              # @hono/node-server entrypoint
      config/env.ts          # environment parsing
      middleware/auth.ts     # authenticate / requireAdmin / requireUpload
      routes/                # Hono route modules
      lib/
        auth/                # password/session helpers
        db/                  # SQLite schema + CRUD
        storage/             # local + S3/R2 adapters
        bundle/              # extraction/cache orchestration
        files/               # MIME/type detection
        mcp/                 # MCP tools and text output
  web/
    index.html
    vite.config.ts           # Vite, React, Tailwind, test setup, dev proxy
    src/
      main.tsx               # React mount
      router.tsx             # TanStack Router route tree + page components
      styles.css             # Tailwind/CSS variable entry
      components/            # UI, layout, bundle, file tree, viewers, admin
      lib/                   # API client, auth provider, URL/file helpers
  shared/
    src/
      bundle/                # manifest schema, validation, security helpers
      url.ts                 # shared URL/storage key helpers
  cli/
    src/                     # eb CLI commands
    scripts/                 # maintained QA upload helper plumbing
tests/
  fixtures/evidence/         # maintained evidence bundle fixture matrix
```

The repository root `package.json` defines the workspace scripts. There is no `pnpm-workspace.yaml`; npm workspaces are the package manager contract.

---

## 3. Routing

### Web Routes

The browser routes are declared in `packages/web/src/router.tsx` with TanStack Router.

| Route | Purpose | Auth |
| --- | --- | --- |
| `/` | Workspace list | user |
| `/login` | Login form | public |
| `/setup` | Initial setup wizard | public while setup is incomplete |
| `/admin` | User/workspace/API-key administration | admin |
| `/settings` | User API-key management | user |
| `/w/$ws` | Bundle list and upload form | user |
| `/w/$ws/b/$bundleId` | Bundle landing page | user |
| `/w/$ws/b/$bundleId/f?path=` | Bundle file viewer | user |
| `/s/$token` | Shared bundle landing page | share token |
| `/s/$token/f?path=` | Shared bundle file viewer | share token |

Vite dev serves the SPA on port 3000 and proxies `/api` to the Hono dev server on port 3001. Production serves the built SPA from Hono.

### API Routes

| Method | Path | Module | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | `routes/auth.ts` | public |
| `POST` | `/api/auth/logout` | `routes/auth.ts` | public |
| `GET` | `/api/auth/me` | `routes/auth.ts` | user |
| `GET` | `/api/w` | `routes/workspace.ts` | user |
| `GET` | `/api/w/:ws/bundle` | `routes/bundle.ts` | user |
| `POST` | `/api/w/:ws/bundle` | `routes/bundle.ts` | `requireUpload` |
| `POST` | `/api/w/:ws/bundle/demo` | `routes/bundle.ts` | `requireUpload` |
| `GET` | `/api/w/:ws/bundles/:bundleId/meta` | `routes/bundle.ts` | user |
| `GET` | `/api/w/:ws/bundles/:bundleId/tree` | `routes/bundle.ts` | user |
| `GET` | `/api/w/:ws/bundles/:bundleId/file?path=` | `routes/bundle.ts` | user |
| `GET` | `/api/w/:ws/bundles/:bundleId/preview?path=` | `routes/bundle.ts` | user |
| `DELETE` | `/api/w/:ws/bundles/:bundleId` | `routes/bundle.ts` | `requireUpload` |
| `GET/POST` | `/api/w/:ws/bundles/:bundleId/share-tokens` | `routes/bundle.ts` | `requireUpload` |
| `DELETE` | `/api/w/:ws/bundles/:bundleId/share-tokens/:tokenId` | `routes/bundle.ts` | `requireUpload` |
| `GET` | `/api/s/:token/{meta,tree,file,preview}` | `routes/bundle.ts` | share token |
| `GET/POST/PATCH/DELETE` | `/api/admin/*` | `routes/admin.ts` | admin |
| `GET/POST/DELETE` | `/api/api-keys/*` | `routes/api-keys.ts` | user/admin by operation |
| `GET/POST` | `/api/setup/*` | `routes/setup.ts` | setup/admin by operation |
| `POST` | `/api/mcp` | `routes/mcp.ts` | optional MCP bearer key |
| `GET` | `/api/health` | `routes/health.ts` | public |

---

## 4. Auth And Authorization

Evidence Browser uses its own session and API-key model, not NextAuth/OIDC.

```text
POST /api/auth/login
  | username + password
  | findUserByUsername
  | verifyPassword with @node-rs/argon2
  | createSession in SQLite
  ` Set-Cookie: evidence_session=<sessionId.signature>; HttpOnly; SameSite=Lax
```

`packages/api/src/middleware/auth.ts` exposes:

- `authenticate` — session or API key accepted.
- `requireAdmin` — admin API key or admin session required.
- `requireUpload` — API key with `upload` or `admin` scope, or an admin session.

Auth bypass is isolated in `packages/api/src/lib/auth/bypass.ts` for local/dev workflows and emits a warning when enabled.

---

## 5. Data And Storage

SQLite uses `better-sqlite3` with WAL and foreign keys enabled. The DB file lives under `$DATA_DIR/evidence.db` by default. CRUD helpers live in `packages/api/src/lib/db/**`.

Core tables:

```sql
users
workspaces
bundles
sessions
api_keys
bundle_share_tokens
```

Storage is selected by `STORAGE_TYPE=local|s3`.

| Adapter | Module | Environment |
| --- | --- | --- |
| Local filesystem | `packages/api/src/lib/storage/local.ts` | `STORAGE_LOCAL_PATH` |
| S3/R2 | `packages/api/src/lib/storage/s3.ts` | `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, credentials |

Shared `storageKey()` validation lives in `packages/shared/src/url.ts` and rejects path traversal, separators, uppercase bundle IDs, spaces, null bytes, and percent-encoded path separators.

---

## 6. Bundle Pipeline

### Upload

```text
POST /api/w/:ws/bundle (multipart/form-data)
  | requireUpload
  | validateUploadedFile
  | validateBundleSize
  | deriveAndValidateBundleId
  | write temp ZIP
  | validateBundleZip from packages/shared/src/bundle/validate-zip.ts
  | storage.putBundle
  ` createBundle row
```

The manifest schema requires:

```json
{
  "version": 1,
  "title": "Bundle title",
  "index": "index.md"
}
```

### Extraction And Viewing

`packages/api/src/lib/bundle/extractor.ts` downloads a stored ZIP, validates entry paths with shared security helpers, extracts into an OS temp cache, parses the manifest, and builds a file tree. Cache entries are in-process and governed by `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`, `MAX_FILE_COUNT`, and `MAX_SINGLE_FILE_SIZE`.

File content routes set defensive content headers and use type detection from `packages/api/src/lib/files/**` / web viewer logic from `packages/web/src/components/viewers/**`.

---

## 7. CLI And Evidence Upload

`packages/cli/src/**` implements the `eb` CLI:

```text
eb upload <file.zip> --workspace <slug> [--bundle-id <id>]
eb bundle list|info|tree|download|delete
eb workspace list|create|update|delete
eb api-key list|create|delete
```

Agents use `.claude/skills/evidence-upload/SKILL.md` for high-level evidence uploads. That skill packages `.evidence/{session}/` into a ZIP and calls `eb upload` through `node packages/cli/dist/bin.js` or an installed `eb` binary.

---

## 8. MCP

`/api/mcp` is a stateless Streamable HTTP MCP endpoint assembled from `packages/api/src/routes/mcp.ts` and `packages/api/src/lib/mcp/**`. If `MCP_API_KEY` is configured, clients must send `Authorization: Bearer <key>`.

Exposed tools include bundle schema, storage info, upload instructions, workspace listing, and bundle listing.

---

## 9. Testing

| Scope | Command |
| --- | --- |
| Full validation | `npm run lint && npm run test && npm run typecheck && npm run build` |
| API | `npm run test:api`, `npm run typecheck:api`, `npm run build:api` |
| Web | `npm run test:web`, `npm run typecheck:web`, `npm run build:web` |
| Shared | `npm run test:shared`, `npm run build:shared` |
| CLI | `npm run test:cli`, `npm run build:cli` |

Maintained bundle fixtures live under `tests/fixtures/evidence`.

---

## 10. Security Boundaries

| Risk | Control |
| --- | --- |
| Path traversal in bundle IDs or storage keys | `storageKey()`, `deriveAndValidateBundleId()`, and shared path checks |
| ZIP traversal / unsafe extraction | shared `validatePathSafety()` + `ensureWithinRoot()` |
| Zip bombs | `MAX_BUNDLE_SIZE`, `MAX_FILE_COUNT`, `MAX_SINGLE_FILE_SIZE` |
| Upload auth bypass | `requireUpload` scope check in Hono middleware |
| Session forgery | signed session IDs and server-side session lookup |
| Password disclosure | Argon2 password hashes and no password logging |
| Viewer XSS | sanitized Markdown and defensive content/security headers |
| MCP exposure | optional `MCP_API_KEY` bearer check |

---

## 11. Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` for production start, `3001` in root dev script | Hono server port |
| `HOSTNAME` | `0.0.0.0` | Hono bind host |
| `DATA_DIR` | `./data` | SQLite DB directory |
| `AUTH_SECRET` | dev fallback | Session signing secret |
| `AUTH_BYPASS` | false | Local/dev auth bypass |
| `STORAGE_TYPE` | `local` | Storage adapter |
| `STORAGE_LOCAL_PATH` | `./data/bundles` | Local bundle storage |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | unset | S3/R2 storage |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | unset | S3/R2 credentials |
| `MCP_API_KEY` | unset | Optional MCP bearer key |
| `MAX_BUNDLE_SIZE` | 500MB | Upload size cap |
| `MAX_FILE_COUNT` | 10000 | Extraction file cap |
| `MAX_SINGLE_FILE_SIZE` | 100MB | Per-file extraction cap |
| `CACHE_TTL_MS` | 30 minutes | Bundle extraction cache TTL |
| `CACHE_MAX_ENTRIES` | 50 | Bundle extraction cache size |

---

## 12. Retired Architecture

The old Next.js `src/app` architecture and `packages/legacy` references are historical only. Do not use them as implementation sources for new work, agent routing, QA fixtures, or upload guidance.
