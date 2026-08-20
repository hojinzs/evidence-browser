import { getEnv } from "@/config/env";
import type { Bundle } from "@evidence-browser/shared/api/types";
import type { Manifest, TreeNode } from "@evidence-browser/shared/bundle/types";

export type BundleFileRead =
  | {
      inline: true;
      path: string;
      sizeBytes: number;
      detectedType: string;
      mimeType: string;
      content: string;
    }
  | {
      inline: false;
      path: string;
      sizeBytes: number | null;
      detectedType: string;
      mimeType: string;
      reason: "binary" | "oversized";
      url: string;
    };

function fencedJson(value: unknown): string {
  return fencedBlock(JSON.stringify(value, null, 2), "json");
}

function fenceMarkerFor(content: string): string {
  const longestBacktickRun = Math.max(0, ...[...content.matchAll(/`+/g)].map((match) => match[0].length));
  return "`".repeat(Math.max(3, longestBacktickRun + 1));
}

function fencedBlock(content: string, info = ""): string {
  const fence = fenceMarkerFor(content);
  const suffix = info ? info : "";
  return `${fence}${suffix}\n${content}\n${fence}`;
}

function toUtcIsoDateTime(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatTree(nodes: TreeNode[], depth = 0): string {
  return nodes
    .map((node) => {
      const prefix = "  ".repeat(depth);
      const marker = node.type === "directory" ? "/" : "";
      const current = `${prefix}- ${node.path}${marker}`;
      if (!node.children?.length) return current;
      return `${current}\n${formatTree(node.children, depth + 1)}`;
    })
    .join("\n");
}

function bundleMetadata(bundle: Bundle) {
  return {
    bundleId: bundle.bundle_id,
    title: bundle.title,
    uploadedBy: bundle.uploader_username,
    createdAt: toUtcIsoDateTime(bundle.created_at),
    sizeBytes: bundle.size_bytes,
  };
}

export function serializeBundleOverview(input: {
  workspace: string;
  bundle: Bundle;
  manifest: Manifest;
  tree: TreeNode[];
  indexFile: BundleFileRead;
}): string {
  const indexSection = input.indexFile.inline
    ? `## Index File: ${input.indexFile.path}

Size: ${input.indexFile.sizeBytes} bytes
Detected type: ${input.indexFile.detectedType}
MIME type: ${input.indexFile.mimeType}

${fencedBlock(input.indexFile.content)}`
    : `## Index File: ${input.indexFile.path}

Inline content unavailable.
Reason: ${input.indexFile.reason}
Size: ${input.indexFile.sizeBytes ?? "unknown"} bytes
Detected type: ${input.indexFile.detectedType}
MIME type: ${input.indexFile.mimeType}
Web URL: ${input.indexFile.url}`;

  return `# Bundle Overview

Workspace: ${input.workspace}

## Metadata

${fencedJson(bundleMetadata(input.bundle))}

## Manifest

${fencedJson(input.manifest)}

## File Tree

${formatTree(input.tree)}

${indexSection}
`;
}

export function serializeBundleTree(input: {
  workspace: string;
  bundleId: string;
  tree: TreeNode[];
}): string {
  return `# Bundle File Tree

Workspace: ${input.workspace}
Bundle: ${input.bundleId}

${formatTree(input.tree)}
`;
}

export function serializeBundleFileRead(input: {
  workspace: string;
  bundleId: string;
  file: BundleFileRead;
}): string {
  if (!input.file.inline) {
    return `# Bundle File

Workspace: ${input.workspace}
Bundle: ${input.bundleId}
Path: ${input.file.path}

Inline content unavailable.
Reason: ${input.file.reason}
Size: ${input.file.sizeBytes ?? "unknown"} bytes
Detected type: ${input.file.detectedType}
MIME type: ${input.file.mimeType}
Web URL: ${input.file.url}
`;
  }

  return `# Bundle File

Workspace: ${input.workspace}
Bundle: ${input.bundleId}
Path: ${input.file.path}
Size: ${input.file.sizeBytes} bytes
Detected type: ${input.file.detectedType}
MIME type: ${input.file.mimeType}

${fencedBlock(input.file.content)}
`;
}

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

  Max bundle size:      ${maxBundleMb} MB
  Max single file:      ${maxFileMb} MB
  Max files per bundle: ${env.MAX_FILE_COUNT.toLocaleString()}

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
${env.MCP_API_KEY ? "  Auth: Bearer token (Authorization: Bearer <MCP_API_KEY>)" : "  Auth: none (public)"}

  Tools:
    get_bundle_schema        — Manifest schema + zip structure
    get_storage_info         — Storage config (no secrets)
    get_upload_instructions  — This guide
    list_workspaces          — All workspaces
    list_bundles             — Bundles in a workspace; optional uploadedBy/since/until/limit filters
    create_upload_url        — Short-lived signed multipart upload URL (upload/admin scope)
    get_bundle_overview      — Manifest, upload metadata, file tree, and inline index file content
    get_bundle_tree          — File tree for one bundle
    read_bundle_file         — Inline text file read up to 256 KB; binary/oversized files return metadata + URL

  Tool access:
    Read tools require read access: read, upload, or admin scoped eb_ API keys;
    MCP_API_KEY and auth bypass are also accepted where configured.
`;
}
