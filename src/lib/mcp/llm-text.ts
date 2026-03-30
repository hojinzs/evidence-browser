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

  const uploadSection =
    env.STORAGE_TYPE === "s3"
      ? `Upload Method (S3):
1. Create a zip file named {bundleId}.zip containing manifest.json and all content files.
2. Upload the zip to S3:
   Bucket: ${env.S3_BUCKET ?? "(configured S3 bucket)"}
   Key: {bundleId}.zip
   Example: PUT s3://${env.S3_BUCKET ?? "your-bucket"}/org/repo/pr-42/run-1.zip
3. The bundle is immediately accessible at: /b/{bundleId}
4. Example viewer URL: ${env.NEXTAUTH_URL}/b/org/repo/pr-42/run-1`
      : `Upload Method (Local Filesystem):
1. Create a zip file named {bundleId}.zip containing manifest.json and all content files.
2. Place the zip at: ${env.STORAGE_LOCAL_PATH}/{bundleId}.zip
   Example: ${env.STORAGE_LOCAL_PATH}/org/repo/pr-42/run-1.zip
3. The bundle is immediately accessible at: /b/{bundleId}
4. Example viewer URL: ${env.NEXTAUTH_URL}/b/org/repo/pr-42/run-1`;

  const maxBundleMb = Math.round(env.MAX_BUNDLE_SIZE / 1024 / 1024);
  const maxFileMb = Math.round(env.MAX_SINGLE_FILE_SIZE / 1024 / 1024);

  return `# Evidence Browser — LLM Integration Guide

Evidence Browser is a read-only viewer for structured evidence bundles (zip files).
AI agents and CI pipelines use it to publish test results, reports, and artifacts
in a browsable format. This file describes how to create and upload bundles.

---

## Bundle Format

A bundle is a .zip file with the following structure:

  {bundleId}.zip
  ├── manifest.json        (REQUIRED)
  └── {any files/dirs}     (at least the index file is required)

### manifest.json Schema

  {
    "version": 1,          // number, required
    "title": "string",     // string, required — displayed as page title
    "index": "index.md"    // string, required — path to landing file within the zip
    // additional fields are allowed and ignored
  }

Rules:
- "version" must be a number (currently only 1 is used)
- "title" is shown in the browser UI as the bundle title
- "index" must be a valid path to a file that exists inside the zip
- Extra fields in manifest.json are permitted (passthrough)

### Bundle ID

The bundle ID is derived from the zip filename (without .zip extension).
It can contain slashes to represent hierarchy:

  org/repo/pr-42/run-1   →  stored as  {basePath}/org/repo/pr-42/run-1.zip
  my-project/2024-01-15  →  stored as  {basePath}/my-project/2024-01-15.zip

Constraint: the bundle ID must not contain a bare "f" path segment
(e.g. "foo/f/bar" is reserved — use "foo/files/bar" instead).

---

## Storage Configuration

${storageSection}

---

## How to Upload a Bundle

${uploadSection}

---

## Size Limits

  Max bundle size (total zip):  ${maxBundleMb} MB
  Max single file size:         ${maxFileMb} MB
  Max file count per bundle:    ${env.MAX_FILE_COUNT.toLocaleString()} files

---

## Viewer URLs

  Landing page:   GET /b/{bundleId}
  Specific file:  GET /b/{bundleId}/f/{filePath}

Examples:
  ${env.NEXTAUTH_URL}/b/org/repo/pr-42/run-1
  ${env.NEXTAUTH_URL}/b/org/repo/pr-42/run-1/f/logs/app.log
  ${env.NEXTAUTH_URL}/b/org/repo/pr-42/run-1/f/screenshots/step-1.png

Note: If authentication is enabled (AUTH_BYPASS=false), users must log in via OIDC
before accessing bundles. API endpoints require a valid session cookie or token.

---

## REST API Endpoints

All API endpoints require authentication (same as viewer pages).

  GET /api/bundle/{encodedBundleId}/meta
    Returns: { manifest, fileTree }
    BundleId encoding: slashes → %2F  (e.g. org%2Frepo%2Fpr-42%2Frun-1)

  GET /api/bundle/{encodedBundleId}/tree
    Returns: file tree only

  GET /api/bundle/{encodedBundleId}/file?path={filePath}
    Returns: raw file content (with CSP headers)

---

## MCP Endpoint (Model Context Protocol)

Evidence Browser exposes an MCP server at:

  POST ${env.NEXTAUTH_URL}/api/mcp

Protocol: MCP Streamable HTTP (stateless mode)
Transport: WebStandardStreamableHTTP
${env.MCP_API_KEY ? "Authentication: Bearer token required (Authorization: Bearer <MCP_API_KEY>)" : "Authentication: none (public endpoint)"}

Available tools:
  get_bundle_schema        — Returns manifest.json schema and zip structure details
  get_storage_info         — Returns storage type, bucket, endpoint, region (no secrets)
  get_upload_instructions  — Step-by-step upload instructions for the current storage
  list_bundles             — Lists available bundle IDs (optional: prefix filter)

MCP Inspector:
  npx @modelcontextprotocol/inspector ${env.NEXTAUTH_URL}/api/mcp

---

## Example Bundle (Minimal)

  manifest.json:
    { "version": 1, "title": "My Test Run", "index": "index.md" }

  index.md:
    # My Test Run
    All tests passed. See [logs](logs/output.log) for details.

  logs/output.log:
    ... test output ...
`;
}
