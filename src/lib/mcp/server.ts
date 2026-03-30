import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getEnv } from "@/config/env";
import { getStorageAdapter } from "@/lib/storage/index";
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

## Bundle ID

Hierarchical, slash-separated:
  org/repo/pr-42/run-1  →  stored as org/repo/pr-42/run-1.zip

Constraint: must not contain a bare "f" path segment.

## Supported File Types (syntax highlighting)

Code: .ts .tsx .js .jsx .py .rb .go .rs .java .kt .swift .css .scss
      .html .xml .yaml .toml .sh .bash .sql .graphql .json .dockerfile
Markdown: .md .mdx
Images: .png .jpg .jpeg .gif .svg .webp .ico
Text: .txt .log .csv .env
Binary: all others (shown as download link)`;

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "evidence-browser", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.tool(
    "get_bundle_schema",
    "Returns the manifest.json schema and expected bundle zip structure for Evidence Browser",
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
    "list_bundles",
    "Lists available bundle IDs in storage",
    { prefix: z.string().optional().describe("Optional prefix to filter results (e.g. 'org/repo/')") },
    async ({ prefix }) => {
      const adapter = getStorageAdapter();
      if (typeof adapter.listBundles !== "function") {
        return {
          content: [
            {
              type: "text" as const,
              text: "list_bundles is not supported by the current storage adapter.",
            },
          ],
          isError: true,
        };
      }
      const bundles = await adapter.listBundles(prefix);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ bundles, count: bundles.length }, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
