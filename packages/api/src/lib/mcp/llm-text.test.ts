import { afterEach, describe, expect, it } from "vitest";
import { resetEnv } from "@/config/env";
import { generateLlmText } from "./llm-text";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
  resetEnv();
}

describe("generateLlmText", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("serializes deterministic local storage guidance from env", () => {
    process.env.STORAGE_TYPE = "local";
    process.env.STORAGE_LOCAL_PATH = "/tmp/evidence-bundles";
    process.env.MAX_BUNDLE_SIZE = String(64 * 1024 * 1024);
    process.env.MAX_SINGLE_FILE_SIZE = String(8 * 1024 * 1024);
    process.env.MAX_FILE_COUNT = "42";
    delete process.env.MCP_API_KEY;
    resetEnv();

    expect(generateLlmText()).toBe(`# Evidence Browser — LLM Integration Guide

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

Storage Type: local
Local Path: /tmp/evidence-bundles

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
      -F "bundleId=pr-42-run-1"

### Manual Upload

Use the web UI at /w/{workspace-slug} — drag and drop a .zip file.

---

## Authentication

Evidence Browser uses local password auth (no OIDC).
Login: POST /api/auth/login with { "username", "password" }
The response sets an evidence_session cookie.

---

## Size Limits

  Max bundle size:      64 MB
  Max single file:      8 MB
  Max files per bundle: 42

---

## URLs

  Dashboard:      GET /
  Workspace:      GET /w/{workspace-slug}
  Bundle:         GET /w/{workspace-slug}/b/{bundleId}
  File:           GET /w/{workspace-slug}/b/{bundleId}/f?path={filePath}

---

## REST API

  GET  /api/w                                         List workspaces
  POST /api/w                                         Create workspace (admin)
  GET  /api/w/{ws}/bundle                             List bundles
  POST /api/w/{ws}/bundle                             Upload bundle (admin)
  GET  /api/w/{ws}/bundles/{bundleId}/meta            Manifest + tree
  GET  /api/w/{ws}/bundles/{bundleId}/tree            File tree
  GET  /api/w/{ws}/bundles/{bundleId}/file?path=      Raw file

---

## MCP Endpoint

  POST /api/mcp
  Protocol: MCP Streamable HTTP (stateless)
  Auth: none (public)

  Tools:
    get_bundle_schema        — Manifest schema + zip structure
    get_storage_info         — Storage config (no secrets)
    get_upload_instructions  — This guide
    list_workspaces          — All workspaces
    list_bundles             — Bundles in a workspace (requires workspace param)
`);
  });

  it("serializes s3 guidance without leaking storage credentials", () => {
    process.env.STORAGE_TYPE = "s3";
    process.env.S3_BUCKET = "evidence-ci";
    process.env.S3_REGION = "us-west-2";
    process.env.S3_ENDPOINT = "https://s3.example.test";
    process.env.S3_FORCE_PATH_STYLE = "true";
    process.env.S3_ACCESS_KEY_ID = "AKIA_TEST_SHOULD_NOT_LEAK";
    process.env.S3_SECRET_ACCESS_KEY = "secret-should-not-leak";
    process.env.MCP_API_KEY = "mcp-secret";
    process.env.MAX_BUNDLE_SIZE = String(500 * 1024 * 1024);
    process.env.MAX_SINGLE_FILE_SIZE = String(100 * 1024 * 1024);
    process.env.MAX_FILE_COUNT = "10000";
    resetEnv();

    const text = generateLlmText();

    expect(text).toContain(`Storage Type: s3
S3 Bucket: evidence-ci
S3 Region: us-west-2
S3 Endpoint: https://s3.example.test
S3 Force Path Style: true`);
    expect(text).toContain("  Auth: Bearer token (Authorization: Bearer <MCP_API_KEY>)");
    expect(text).toContain("Max files per bundle: 10,000");
    expect(text).not.toContain("AKIA_TEST_SHOULD_NOT_LEAK");
    expect(text).not.toContain("secret-should-not-leak");
    expect(text).not.toContain("mcp-secret");
  });
});
