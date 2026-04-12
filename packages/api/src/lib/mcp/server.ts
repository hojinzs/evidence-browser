import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getEnv } from "@/config/env";
import { listWorkspaces } from "@/lib/db/workspaces";
import { listBundles as dbListBundles } from "@/lib/db/bundles";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { generateLlmText } from "./llm-text";

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

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "evidence-browser", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  server.tool(
    "get_bundle_schema",
    "Returns the manifest.json schema, expected bundle zip structure, and upload instructions",
    async () => ({
      content: [{ type: "text" as const, text: BUNDLE_SCHEMA_TEXT }],
    })
  );

  server.tool(
    "get_storage_info",
    "Returns the configured storage type, bucket, endpoint, and region (no secrets)",
    async () => {
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
    async () => ({
      content: [{ type: "text" as const, text: generateLlmText() }],
    })
  );

  server.tool(
    "list_workspaces",
    "Lists all workspaces in Evidence Browser",
    async () => {
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

  return server;
}
