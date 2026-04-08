import { getEnv } from "@/config/env";

export function generateLlmText(): string {
  const env = getEnv();

  const storageSection =
    env.STORAGE_TYPE === "s3"
      ? `Storage Type: s3
S3 Bucket: ${env.S3_BUCKET ?? "(not set)"}
S3 Region: ${env.S3_REGION ?? "auto"}
S3 Endpoint: ${env.S3_ENDPOINT ?? "(AWS default)"}
S3 Force Path Style: ${env.S3_FORCE_PATH_STYLE}`
      : `Storage Type: local
Local Path: ${env.STORAGE_LOCAL_PATH ?? "(not set)"}`;

  const maxBundleMb = Math.round(env.MAX_BUNDLE_SIZE / 1024 / 1024);
  const maxFileMb = Math.round(env.MAX_SINGLE_FILE_SIZE / 1024 / 1024);

  return `# Evidence Browser — LLM Integration Guide

Evidence Browser is a viewer for structured evidence bundles (zip files) organized in workspaces.
AI agents and CI pipelines use it to publish test results, reports, and artifacts.

---

## Bundle Format

A bundle is a .zip file:

  {bundleId}.zip
  ├── manifest.json        (REQUIRED)
  └── {any files/dirs}     (at least the index file is required)

### manifest.json

  {
    "version": 1,          // number, required
    "title": "string",     // string, required — displayed as page title
    "index": "index.md"    // string, required — path to landing file
  }

---

## Workspaces

Bundles are organized into workspaces (logical groups).
Each workspace has a slug used in URLs and storage keys.

  Storage key: {workspace-slug}/{bundleId}.zip

---

## Storage

${storageSection}

---

## How to Upload

### API Upload (recommended for CI/agents)

  POST /api/w/{workspace-slug}/bundle
  Content-Type: multipart/form-data
  Cookie: evidence_session=...

  Form fields:
    file:     .zip file (required)
    bundleId: custom ID (optional, defaults to filename without .zip)

  Example (curl):
    curl -X POST http://localhost:3000/api/w/my-workspace/bundle \\
      -b "evidence_session=..." \\
      -F "file=@bundle.zip" \\
      -F "bundleId=pr-42/run-1"

### Manual Upload

Use the web UI at /w/{workspace-slug} — drag and drop a .zip file.

---

## Authentication

Evidence Browser uses local password auth (no OIDC).
Login: POST /api/auth/login with { "username", "password" }
The response sets an evidence_session cookie.

---

## Size Limits

  Max bundle size:      ${maxBundleMb} MB
  Max single file:      ${maxFileMb} MB
  Max files per bundle: ${env.MAX_FILE_COUNT.toLocaleString()}

---

## URLs

  Dashboard:      GET /
  Workspace:      GET /w/{workspace-slug}
  Bundle:         GET /w/{workspace-slug}/b/{bundleId}
  File:           GET /w/{workspace-slug}/b/{bundleId}/f/{filePath}

---

## REST API

  GET  /api/w                                         List workspaces
  POST /api/w                                         Create workspace (admin)
  GET  /api/w/{ws}/bundle                             List bundles
  POST /api/w/{ws}/bundle                             Upload bundle (admin)
  GET  /api/w/{ws}/bundle/{encodedBundleId}/meta      Manifest + tree
  GET  /api/w/{ws}/bundle/{encodedBundleId}/tree      File tree
  GET  /api/w/{ws}/bundle/{encodedBundleId}/file?path= Raw file

---

## MCP Endpoint

  POST /api/mcp
  Protocol: MCP Streamable HTTP (stateless)
${env.MCP_API_KEY ? "  Auth: Bearer token (Authorization: Bearer <MCP_API_KEY>)" : "  Auth: none (public)"}

  Tools:
    get_bundle_schema        — Manifest schema + zip structure
    get_storage_info         — Storage config (no secrets)
    get_upload_instructions  — This guide
    list_workspaces          — All workspaces
    list_bundles             — Bundles in a workspace (requires workspace param)
`;
}
