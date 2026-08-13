import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getEnv } from "@/config/env";
import { listWorkspaces } from "@/lib/db/workspaces";
import { listBundles as dbListBundles } from "@/lib/db/bundles";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import type { AuthUser } from "@/lib/auth/types";
import type { ScopedApiKeyScope } from "@/middleware/auth";
import { generateLlmText } from "./llm-text";

export type McpAuthContext =
  | { kind: "api-key"; user: AuthUser; scope: ScopedApiKeyScope }
  | { kind: "instance-key" }
  | { kind: "bypass"; user: AuthUser };

type McpToolAccess = "authenticated" | "read" | "write";

type McpServerOptions = {
  includeTestWriteTool?: boolean;
};

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
  if (required === "read") return true;
  return authContext.kind === "api-key" && ["upload", "admin"].includes(authContext.scope);
}

function requireToolAccess(authContext: McpAuthContext, required: McpToolAccess) {
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

export function createMcpServer(
  authContext: McpAuthContext = { kind: "instance-key" },
  options: McpServerOptions = {}
): McpServer {
  const server = new McpServer(
    { name: "evidence-browser", version: "0.2.0" },
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
    "Lists bundles in a workspace",
    {
      workspace: z.string().describe("Workspace slug (required)"),
    },
    async ({ workspace }) => {
      const authError = requireToolAccess(authContext, "read");
      if (authError) return authError;
      const ws = findWorkspaceBySlug(workspace);
      if (!ws) {
        return {
          content: [{ type: "text" as const, text: `Workspace "${workspace}" not found.` }],
          isError: true,
        };
      }
      const bundles = dbListBundles(ws.id);
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
              },
              null,
              2
            ),
          },
        ],
      };
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
