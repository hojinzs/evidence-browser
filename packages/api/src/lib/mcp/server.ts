import fs from "fs";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getEnv } from "@/config/env";
import { listWorkspaces } from "@/lib/db/workspaces";
import { listBundles as dbListBundles } from "@/lib/db/bundles";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { findBundleWithUploader } from "@/lib/db/bundles";
import { extractBundle, getFileContent } from "@/lib/bundle/extractor";
import { ensureWithinRoot, validatePathSafety } from "@/lib/bundle/security";
import { detectFileType, getMimeType } from "@evidence-browser/shared/files/detect";
import type { Bundle, Workspace } from "@evidence-browser/shared/api/types";
import type { CacheEntry } from "@evidence-browser/shared/bundle/types";
import type { AuthUser } from "@/lib/auth/types";
import type { ScopedApiKeyScope } from "@/middleware/auth";
import { validateBundleId } from "@/lib/bundle/upload-validation";
import { createUploadToken } from "@/lib/upload-token";
import {
  generateLlmText,
  serializeBundleFileRead,
  serializeBundleOverview,
  serializeBundleTree,
  type BundleFileRead,
} from "./llm-text";

export type McpAuthContext =
  | { kind: "api-key"; user: AuthUser; scope: ScopedApiKeyScope }
  | { kind: "instance-key" }
  | { kind: "bypass"; user: AuthUser };

type McpToolAccess = "authenticated" | "read" | "write";

type McpServerOptions = {
  includeTestWriteTool?: boolean;
  origin?: string;
};

type McpTextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
};

type McpBundleResolution =
  | { workspace: Workspace; bundle: Bundle }
  | { error: McpTextResult };

const MCP_INLINE_FILE_LIMIT_BYTES = 256 * 1024;
const MCP_LIST_BUNDLES_DEFAULT_LIMIT = 50;
const MCP_LIST_BUNDLES_MAX_LIMIT = 200;
const ISO_OFFSET_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const BUNDLE_SCHEMA_TEXT = `## manifest.json

Required fields:
  version  number   Bundle format version (use 1)
  title    string   Human-readable title shown in the browser UI
  index    string   Relative path to the landing file within the zip

Additional fields are allowed (passthrough).

Example:
{
  "version": 1,
  "title": "PR #42 — Test Results",
  "index": "index.md"
}

## Zip Structure

  {bundleId}.zip
  ├── manifest.json          (required)
  ├── index.md               (required — referenced by manifest.index)
  ├── logs/
  │   └── output.log
  └── screenshots/
      └── step-1.png

## Bundle ID & Storage Key

Bundles are organized under workspaces:
  Storage key: {workspace-slug}/{bundleId}.zip
  URL: /w/{workspace-slug}/b/{bundleId}

## Upload

  POST /api/w/{workspace-slug}/bundle
  Content-Type: multipart/form-data
  Cookie: evidence_session=...

  Form fields:
    file: .zip file (required)
    bundleId: custom bundle ID (optional, defaults to filename without .zip)

## Supported File Types

Code: .ts .tsx .js .jsx .py .rb .go .rs .java .kt .swift .css .scss
      .html .xml .yaml .toml .sh .bash .sql .graphql .json .dockerfile
Markdown: .md .mdx
Images: .png .jpg .jpeg .gif .svg .webp .ico
Text: .txt .log .csv .env
Binary: all others (shown as download link)`;

function hasToolAccess(authContext: McpAuthContext, required: McpToolAccess): boolean {
  if (required === "authenticated") return true;
  if (authContext.kind === "bypass") return true;
  if (authContext.kind === "instance-key") {
    return required === "read" && Boolean(getEnv().MCP_API_KEY);
  }
  if (required === "read") return ["read", "upload", "admin"].includes(authContext.scope);
  return ["upload", "admin"].includes(authContext.scope);
}

function requireToolAccess(authContext: McpAuthContext, required: McpToolAccess): McpTextResult | null {
  if (hasToolAccess(authContext, required)) return null;
  return {
    content: [
      {
        type: "text" as const,
        text:
          required === "write"
            ? "Forbidden: this MCP tool requires upload or admin scope."
            : "Forbidden: this MCP tool requires read scope.",
      },
    ],
    isError: true,
  };
}

function clampListLimit(limit: number | undefined): number {
  if (limit === undefined) return MCP_LIST_BUNDLES_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MCP_LIST_BUNDLES_MAX_LIMIT);
}

function validateIsoDateFilter(name: string, value: string | undefined): McpTextResult | null {
  if (value === undefined) return null;
  if (!ISO_OFFSET_DATE_TIME_RE.test(value) || Number.isNaN(Date.parse(value))) {
    return {
      content: [{ type: "text" as const, text: `${name} must be an ISO-8601 date/time with an explicit timezone offset.` }],
      isError: true,
    };
  }
  return null;
}

function createBundleFileUrl(workspace: string, bundleId: string, filePath: string): string {
  return `/w/${encodeURIComponent(workspace)}/b/${encodeURIComponent(bundleId)}/f?path=${encodeURIComponent(filePath)}`;
}

async function resolveMcpBundle(workspace: string, bundleId: string): Promise<McpBundleResolution> {
  const ws = findWorkspaceBySlug(workspace);
  if (!ws) {
    return {
      error: {
        content: [{ type: "text" as const, text: `Workspace "${workspace}" not found.` }],
        isError: true,
      },
    };
  }

  const bundle = findBundleWithUploader(ws.id, bundleId);
  if (!bundle) {
    return {
      error: {
        content: [{ type: "text" as const, text: `Bundle "${bundleId}" not found in workspace "${workspace}".` }],
        isError: true,
      },
    };
  }

  return {
    workspace: ws,
    bundle,
  };
}

async function readMcpBundleFile(
  entry: CacheEntry,
  workspace: string,
  bundleId: string,
  filePath: string
): Promise<BundleFileRead> {
  if (!validatePathSafety(filePath)) {
    throw new Error("Invalid file path");
  }

  const fullPath = path.join(entry.cacheDir, filePath);
  if (!ensureWithinRoot(entry.cacheDir, fullPath)) {
    throw new Error("Invalid file path");
  }

  const detectedType = detectFileType(filePath);
  const mimeType = getMimeType(filePath);
  const stat = await fs.promises.stat(fullPath);
  if (!stat.isFile()) {
    throw new Error("Not a file");
  }

  if (detectedType === "binary" || detectedType === "image") {
    return {
      inline: false,
      path: filePath,
      sizeBytes: stat.size,
      detectedType,
      mimeType,
      reason: "binary",
      url: createBundleFileUrl(workspace, bundleId, filePath),
    };
  }

  if (stat.size > MCP_INLINE_FILE_LIMIT_BYTES) {
    return {
      inline: false,
      path: filePath,
      sizeBytes: stat.size,
      detectedType,
      mimeType,
      reason: "oversized",
      url: createBundleFileUrl(workspace, bundleId, filePath),
    };
  }

  const content = await getFileContent(entry.cacheDir, filePath);
  return {
    inline: true,
    path: filePath,
    sizeBytes: stat.size,
    detectedType,
    mimeType,
    content: content.toString("utf8"),
  };
}

function fileNotFoundError(pathLabel: string): McpTextResult {
  return {
    content: [{ type: "text" as const, text: `File "${pathLabel}" not found.` }],
    isError: true,
  };
}

export function createMcpServer(
  authContext: McpAuthContext,
  options: McpServerOptions = {}
): McpServer {
  const server = new McpServer(
    { name: "evidence-browser", version: "0.3.0" },
    { capabilities: { tools: {} } }
  );

  server.tool(
    "get_bundle_schema",
    "Returns the manifest.json schema, expected bundle zip structure, and upload instructions",
    async () => {
      const authError = requireToolAccess(authContext, "authenticated");
      if (authError) return authError;
      return {
        content: [{ type: "text" as const, text: BUNDLE_SCHEMA_TEXT }],
      };
    }
  );

  server.tool(
    "get_storage_info",
    "Returns the configured storage type, bucket, endpoint, and region (no secrets)",
    async () => {
      const authError = requireToolAccess(authContext, "authenticated");
      if (authError) return authError;
      const env = getEnv();
      const info =
        env.STORAGE_TYPE === "s3"
          ? {
              type: "s3",
              bucket: env.S3_BUCKET ?? null,
              region: env.S3_REGION ?? "auto",
              endpoint: env.S3_ENDPOINT ?? null,
              forcePathStyle: env.S3_FORCE_PATH_STYLE,
            }
          : {
              type: "local",
              localPath: env.STORAGE_LOCAL_PATH ?? null,
            };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
      };
    }
  );

  server.tool(
    "get_upload_instructions",
    "Returns step-by-step instructions for uploading a bundle to Evidence Browser",
    async () => {
      const authError = requireToolAccess(authContext, "authenticated");
      if (authError) return authError;
      return {
        content: [{ type: "text" as const, text: generateLlmText() }],
      };
    }
  );

  server.tool(
    "list_workspaces",
    "Lists all workspaces in Evidence Browser",
    async () => {
      const authError = requireToolAccess(authContext, "read");
      if (authError) return authError;
      const workspaces = listWorkspaces();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { workspaces: workspaces.map((w) => ({ slug: w.slug, name: w.name, description: w.description })), count: workspaces.length },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "list_bundles",
    "Lists bundles in a workspace, optionally filtered by uploader, time range, and limit",
    {
      workspace: z.string().describe("Workspace slug (required)"),
      uploadedBy: z.string().optional().describe("Uploader username filter"),
      since: z.string().optional().describe("Only bundles uploaded at or after this ISO-8601 date/time with timezone offset"),
      until: z.string().optional().describe("Only bundles uploaded at or before this ISO-8601 date/time with timezone offset"),
      limit: z.number().int().positive().optional().describe("Max bundles to return (default 50, capped at 200)"),
    },
    async ({ workspace, uploadedBy, since, until, limit }) => {
      const authError = requireToolAccess(authContext, "read");
      if (authError) return authError;
      const sinceError = validateIsoDateFilter("since", since);
      if (sinceError) return sinceError;
      const untilError = validateIsoDateFilter("until", until);
      if (untilError) return untilError;
      const ws = findWorkspaceBySlug(workspace);
      if (!ws) {
        return {
          content: [{ type: "text" as const, text: `Workspace "${workspace}" not found.` }],
          isError: true,
        };
      }
      const effectiveLimit = clampListLimit(limit);
      const bundles = dbListBundles(ws.id, { uploadedBy, since, until, limit: effectiveLimit });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                workspace: ws.slug,
                bundles: bundles.map((b) => ({
                  bundleId: b.bundle_id,
                  title: b.title,
                  uploadedBy: b.uploader_username,
                  createdAt: b.created_at,
                  sizeBytes: b.size_bytes,
                })),
                count: bundles.length,
                filters: {
                  uploadedBy: uploadedBy ?? null,
                  since: since ?? null,
                  until: until ?? null,
                  limit: effectiveLimit,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "create_upload_url",
    "Mints a short-lived signed multipart upload URL for a workspace bundle",
    {
      workspace: z.string().describe("Workspace slug (required)"),
      bundleId: z.string().optional().describe("Optional bundle ID to pin in the signed URL"),
      ttlSeconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional TTL in seconds; defaults to 600 and caps at 3600"),
    },
    async ({ workspace, bundleId, ttlSeconds }) => {
      const authError = requireToolAccess(authContext, "write");
      if (authError) return authError;
      if (authContext.kind !== "api-key" && authContext.kind !== "bypass") {
        return {
          content: [{ type: "text" as const, text: "Forbidden: this MCP tool requires an issuing user." }],
          isError: true,
        };
      }

      const ws = findWorkspaceBySlug(workspace);
      if (!ws) {
        return {
          content: [{ type: "text" as const, text: `Workspace "${workspace}" not found.` }],
          isError: true,
        };
      }

      if (bundleId !== undefined) {
        const bundleIdResult = validateBundleId(bundleId);
        if (!bundleIdResult.ok) {
          return {
            content: [{ type: "text" as const, text: bundleIdResult.error.message }],
            isError: true,
          };
        }
      }

      const { token, expiresAt } = createUploadToken({
        workspace: ws.slug,
        bundleId,
        issuerUserId: authContext.user.id,
        ttlSeconds,
      });
      const uploadUrl = new URL(`/api/upload/${token}`, options.origin ?? "http://localhost:3000").toString();
      const instructions = bundleId
        ? `curl -X POST '${uploadUrl}' -F 'file=@bundle.zip' # bundleId is pinned to '${bundleId}'; omit the bundleId form field or set it to the same value.`
        : `curl -X POST '${uploadUrl}' -F 'file=@bundle.zip' -F 'bundleId=pr-42-run-1' # bundleId is optional; omit it to use the filename without .zip.`;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                uploadUrl,
                method: "POST",
                expiresAt: expiresAt.toISOString(),
                instructions,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "get_bundle_overview",
    "Returns manifest, metadata, file tree, and inline manifest index file content for one bundle",
    {
      workspace: z.string().describe("Workspace slug (required)"),
      bundleId: z.string().describe("Bundle ID (required)"),
    },
    async ({ workspace, bundleId }) => {
      const authError = requireToolAccess(authContext, "read");
      if (authError) return authError;
      const resolved = await resolveMcpBundle(workspace, bundleId);
      if ("error" in resolved) return resolved.error;

      let indexPath: string | undefined;
      try {
        const entry = await extractBundle(resolved.bundle.storage_key);
        indexPath = entry.manifest.index;
        const indexFile = await readMcpBundleFile(entry, resolved.workspace.slug, bundleId, indexPath);
        return {
          content: [
            {
              type: "text" as const,
              text: serializeBundleOverview({
                workspace: resolved.workspace.slug,
                bundle: resolved.bundle,
                manifest: entry.manifest,
                tree: entry.fileTree,
                indexFile,
              }),
            },
          ],
        };
      } catch (err) {
        if (err instanceof Error && err.message === "Invalid file path") {
          return {
            content: [{ type: "text" as const, text: "Invalid file path." }],
            isError: true,
          };
        }
        if (err instanceof Error && err.message === "Not a file") {
          return {
            content: [{ type: "text" as const, text: `Path "${indexPath ?? "manifest index"}" is not a file.` }],
            isError: true,
          };
        }
        if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "ENOENT") {
          return fileNotFoundError(indexPath ?? "manifest index");
        }
        throw err;
      }
    }
  );

  server.tool(
    "get_bundle_tree",
    "Returns the file tree for one bundle",
    {
      workspace: z.string().describe("Workspace slug (required)"),
      bundleId: z.string().describe("Bundle ID (required)"),
    },
    async ({ workspace, bundleId }) => {
      const authError = requireToolAccess(authContext, "read");
      if (authError) return authError;
      const resolved = await resolveMcpBundle(workspace, bundleId);
      if ("error" in resolved) return resolved.error;

      const entry = await extractBundle(resolved.bundle.storage_key);
      return {
        content: [
          {
            type: "text" as const,
            text: serializeBundleTree({
              workspace: resolved.workspace.slug,
              bundleId,
              tree: entry.fileTree,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "read_bundle_file",
    "Reads one text file from a bundle, or returns metadata and web URL for binary/oversized files",
    {
      workspace: z.string().describe("Workspace slug (required)"),
      bundleId: z.string().describe("Bundle ID (required)"),
      path: z.string().describe("Bundle-relative file path (required)"),
    },
    async ({ workspace, bundleId, path: filePath }) => {
      const authError = requireToolAccess(authContext, "read");
      if (authError) return authError;
      const resolved = await resolveMcpBundle(workspace, bundleId);
      if ("error" in resolved) return resolved.error;

      try {
        const entry = await extractBundle(resolved.bundle.storage_key);
        const file = await readMcpBundleFile(entry, resolved.workspace.slug, bundleId, filePath);
        return {
          content: [
            {
              type: "text" as const,
              text: serializeBundleFileRead({
                workspace: resolved.workspace.slug,
                bundleId,
                file,
              }),
            },
          ],
        };
      } catch (err) {
        if (err instanceof Error && err.message === "Invalid file path") {
          return {
            content: [{ type: "text" as const, text: "Invalid file path." }],
            isError: true,
          };
        }
        if (err instanceof Error && err.message === "Not a file") {
          return {
            content: [{ type: "text" as const, text: `Path "${filePath}" is not a file.` }],
            isError: true,
          };
        }
        if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "ENOENT") {
          return fileNotFoundError(filePath);
        }
        throw err;
      }
    }
  );

  if (options.includeTestWriteTool) {
    server.tool(
      "__test_write_scope",
      "Test-only write-capability probe",
      async () => {
        const authError = requireToolAccess(authContext, "write");
        if (authError) return authError;
        return {
          content: [{ type: "text" as const, text: "write access granted" }],
        };
      }
    );
  }

  server.registerResource(
    "llm_integration_guide",
    "evidence://llm.txt",
    {
      title: "LLM integration guide",
      description: "Evidence Browser upload and MCP integration guide",
      mimeType: "text/plain",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: generateLlmText() }],
    })
  );

  return server;
}
