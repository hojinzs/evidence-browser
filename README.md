# Evidence Browser

A read-only viewer for structured evidence bundles. AI agents and CI pipelines create zip bundles containing test results, reports, and artifacts — Evidence Browser renders them in a browsable, shareable interface.

## Features

- **Bundle viewer** — Browse zip bundles with file tree navigation
- **Rich rendering** — Markdown (with embedded images), syntax-highlighted code, image preview
- **Pluggable storage** — Local filesystem or S3/R2-compatible object storage
- **Authentication** — Built-in username/password session auth for admin and API access
- **AI Agent integration** — `/llm.txt` endpoint and MCP server for programmatic access
- **Hierarchical bundle IDs** — `org/repo/pr-42/run-1` maps to nested storage paths

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env.local

# Start API + web development servers
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the web app.

- Web dev server: `http://localhost:3000` (Vite)
- API dev server: `http://localhost:3001` (proxied as `/api` from the web app)

## Environment Variables

### Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SECRET` | `evidence-browser-default-secret-change-me` | Session signing secret (must be explicitly set in production) |

### Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_TYPE` | `local` | `local` or `s3` |
| `STORAGE_LOCAL_PATH` | — | Directory path (required when `local`) |
| `S3_BUCKET` | — | Bucket name (required when `s3`) |
| `S3_REGION` | `auto` | AWS region or `auto` for R2 |
| `S3_ENDPOINT` | — | Custom endpoint (e.g. R2: `https://<account>.r2.cloudflarestorage.com`) |
| `S3_ACCESS_KEY_ID` | — | S3 access key |
| `S3_SECRET_ACCESS_KEY` | — | S3 secret key |
| `S3_FORCE_PATH_STYLE` | `false` | Use path-style URLs (for MinIO, etc.) |

### Limits & Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_BUNDLE_SIZE` | `524288000` (500 MB) | Maximum zip file size |
| `MAX_FILE_COUNT` | `10000` | Maximum files per bundle |
| `MAX_SINGLE_FILE_SIZE` | `104857600` (100 MB) | Maximum single file size |
| `CACHE_TTL_MS` | `1800000` (30 min) | In-memory cache TTL |
| `CACHE_MAX_ENTRIES` | `50` | LRU cache capacity |

### MCP

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_API_KEY` | — | Optional Bearer token for `/api/mcp` auth. If unset, the endpoint is public. |

## Bundle Format

A bundle is a zip file with a required `manifest.json`:

```
my-bundle.zip
├── manifest.json
├── index.md          # landing page (referenced by manifest)
├── logs/
│   └── output.log
└── screenshots/
    └── step-1.png
```

### manifest.json

```json
{
  "version": 1,
  "title": "PR #42 — Test Results",
  "index": "index.md"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | number | yes | Bundle format version (use `1`) |
| `title` | string | yes | Displayed as the page title |
| `index` | string | yes | Relative path to the landing file |

Additional fields are allowed and passed through.

### Bundle ID

Derived from the zip filename (without `.zip`). Supports hierarchical paths:

```
org/repo/pr-42/run-1  →  stored as  org/repo/pr-42/run-1.zip
```

## Storage

### Local Filesystem

```env
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./data/bundles
```

Place bundles at `{STORAGE_LOCAL_PATH}/{bundleId}.zip`.

### S3 / Cloudflare R2

```env
STORAGE_TYPE=s3
S3_BUCKET=evidence-bundles
S3_REGION=auto
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Upload bundles with key `{bundleId}.zip`.

## AI Agent Integration

### llm.txt

```
GET /llm.txt
```

Returns a plain-text guide describing the bundle format, storage configuration, upload instructions, size limits, and available API endpoints. Designed for LLM consumption (similar to `robots.txt`).

### MCP Server

Evidence Browser exposes an [MCP](https://modelcontextprotocol.io) server via Streamable HTTP:

```
POST /api/mcp
Accept: application/json, text/event-stream
Authorization: Bearer <MCP_API_KEY>   # only if MCP_API_KEY is set
```

Available tools:

| Tool | Description |
|------|-------------|
| `get_bundle_schema` | Returns manifest.json schema and zip structure |
| `get_storage_info` | Returns storage type, bucket, endpoint, region (no secrets) |
| `get_upload_instructions` | Step-by-step upload instructions for the current storage |
| `list_bundles` | Lists available bundle IDs with optional prefix filter |

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp
```

## API Reference

All endpoints require authentication (unless `AUTH_BYPASS=true` in development).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/b/{bundleId}` | Bundle landing page |
| `GET` | `/b/{bundleId}/f/{filePath}` | File viewer |
| `GET` | `/api/bundle/{encodedBundleId}/meta` | Bundle manifest + file tree (JSON) |
| `GET` | `/api/bundle/{encodedBundleId}/tree` | File tree only (JSON) |
| `GET` | `/api/bundle/{encodedBundleId}/file?path={filePath}` | Raw file content |
| `GET` | `/llm.txt` | LLM integration guide (plain text) |
| `POST` | `/api/mcp` | MCP Streamable HTTP endpoint |

Bundle IDs with slashes must be URL-encoded in API paths (e.g. `org%2Frepo%2Fpr-42`).

## Deployment

### Docker (standalone)

```bash
npm run build
npm run start
```

`npm run build` compiles:

- `packages/shared` (shared types/utilities)
- `packages/api` (Hono API server)
- `packages/web` (Vite SPA), then copies it to root `web/` for static serving by the API runtime

## Tech Stack

- [Hono](https://hono.dev) (Node server + API routes)
- [React 19](https://react.dev)
- [Vite 8](https://vite.dev) (web app build/dev server)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Shiki](https://shiki.style) (Syntax highlighting)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) (AI agent integration)
