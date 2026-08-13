import fs from "fs";
import os from "os";
import path from "path";
import type Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { createTestDb } from "@/lib/db/index";
import { createBundle } from "@/lib/db/bundles";
import { createUser } from "@/lib/db/users";
import { createWorkspace } from "@/lib/db/workspaces";
import { createTransportPair } from "@/lib/mcp/test-transport";
import type { CacheEntry, Manifest, TreeNode } from "@evidence-browser/shared/bundle/types";
import { createMcpServer, type McpAuthContext } from "./server";

let testDb: Database.Database;
let fixtureDirs: string[] = [];

const extractorState = vi.hoisted(() => ({
  extractBundle: vi.fn(),
}));

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

vi.mock("@/lib/bundle/extractor", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bundle/extractor")>();
  return {
    ...original,
    extractBundle: extractorState.extractBundle,
  };
});
const TEST_USER = { id: "user-1", username: "member", role: "user" as const };

const ORIGINAL_ENV = { ...process.env };

async function restoreEnv() {
  await Promise.all(fixtureDirs.map((dir) => fs.promises.rm(dir, { recursive: true, force: true })));
  fixtureDirs = [];
  process.env = { ...ORIGINAL_ENV };
  resetEnv();
}

function validManifest(title = "MCP Fixture", index = "index.md"): Manifest {
  return { version: 1, title, index };
}

function treeFromPaths(filePaths: string[]): TreeNode[] {
  function build(prefix: string): TreeNode[] {
    const direct = filePaths
      .map((filePath) => filePath.slice(prefix.length))
      .filter((filePath) => filePath && !filePath.startsWith("/"));
    const names = new Set(direct.map((filePath) => filePath.split("/")[0]));

    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const nodePath = prefix ? `${prefix}/${name}` : name;
        const hasChildren = filePaths.some((filePath) => filePath.startsWith(`${nodePath}/`));
        return {
          name,
          type: hasChildren ? "directory" : "file",
          path: nodePath,
          children: hasChildren ? build(nodePath) : undefined,
        };
      });
  }

  return build("");
}

async function setExtractedBundle(files: Record<string, string | Buffer>, manifest = validManifest()) {
  const cacheDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mcp-bundle-"));
  fixtureDirs.push(cacheDir);

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(cacheDir, filePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content);
  }

  if (!files["manifest.json"]) {
    await fs.promises.writeFile(path.join(cacheDir, "manifest.json"), JSON.stringify(manifest));
  }

  const fileTree = treeFromPaths([...new Set(["manifest.json", ...Object.keys(files)])]);
  const entry: CacheEntry = {
    cacheDir,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    manifest,
    fileTree,
  };
  extractorState.extractBundle.mockResolvedValue(entry);
}

async function withMcpClient<T>(
  authContext: McpAuthContext,
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const { serverTransport, clientTransport } = createTransportPair();
  const server = createMcpServer(authContext);
  const client = new Client({ name: "evidence-browser-test", version: "0.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    return await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  const item = content[0];
  if (!item || item.type !== "text") throw new Error("Expected text MCP content");
  return item.text ?? "";
}

async function seedBundleFixture(options: {
  username?: string;
  workspaceSlug?: string;
  bundleId?: string;
  title?: string;
  storageKey?: string;
  createdAt?: string;
}) {
  const user = await createUser(options.username ?? "member", "password123", "user");
  const workspace = createWorkspace(
    options.workspaceSlug ?? "qa",
    "QA",
    "QA workspace",
    user.id
  );
  const bundle = createBundle({
    bundleId: options.bundleId ?? "run-1",
    workspaceId: workspace.id,
    title: options.title ?? "Run 1",
    storageKey: options.storageKey ?? `${workspace.slug}/${options.bundleId ?? "run-1"}`,
    sizeBytes: 512,
    uploadedBy: user.id,
  });

  if (options.createdAt) {
    testDb.prepare("UPDATE bundles SET created_at = ? WHERE id = ?").run(options.createdAt, bundle.id);
  }

  return { user, workspace, bundle };
}

describe("createMcpServer", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.MAX_BUNDLE_SIZE = "1000000";
    process.env.MAX_FILE_COUNT = "100";
    process.env.MAX_SINGLE_FILE_SIZE = "1000000";
    process.env.CACHE_TTL_MS = "1800000";
    process.env.CACHE_MAX_ENTRIES = "50";
    resetEnv();
  });

  afterEach(async () => {
    await restoreEnv();
  });

  it("lists registered tools and resources, then invokes a minimal tool", async () => {
    process.env.STORAGE_TYPE = "local";
    process.env.STORAGE_LOCAL_PATH = "/tmp/evidence-bundles";
    resetEnv();

    const { serverTransport, clientTransport } = createTransportPair();
    const server = createMcpServer({ kind: "instance-key" });
    const client = new Client({ name: "evidence-browser-test", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      await expect(client.listTools()).resolves.toMatchObject({
        tools: [
          { name: "get_bundle_schema" },
          { name: "get_storage_info" },
          { name: "get_upload_instructions" },
          { name: "list_workspaces" },
          { name: "list_bundles" },
          { name: "create_upload_url" },
          { name: "get_bundle_overview" },
          { name: "get_bundle_tree" },
          { name: "read_bundle_file" },
        ],
      });

      await expect(client.listResources()).resolves.toMatchObject({
        resources: [
          {
            name: "llm_integration_guide",
            uri: "evidence://llm.txt",
            mimeType: "text/plain",
          },
        ],
      });

      const result = await client.callTool({
        name: "get_bundle_schema",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Binary: all others (shown as download link)"),
        }),
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("allows read-scoped API keys to call read tools", async () => {
    const user = await createUser("member", "password123", "user");
    createWorkspace("infra", "Infrastructure", "Ops workspace", user.id);

    const { serverTransport, clientTransport } = createTransportPair();
    const server = createMcpServer({
      kind: "api-key",
      user: { id: user.id, username: "[api-key:eb_read]", role: "user" },
      scope: "read",
    });
    const client = new Client({ name: "evidence-browser-test", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = await client.callTool({
        name: "list_workspaces",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining('"slug": "infra"'),
        }),
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    ["instance key", { kind: "instance-key" } satisfies McpAuthContext, false],
    [
      "read-scoped API key",
      { kind: "api-key", user: TEST_USER, scope: "read" } satisfies McpAuthContext,
      false,
    ],
    [
      "upload-scoped API key",
      { kind: "api-key", user: TEST_USER, scope: "upload" } satisfies McpAuthContext,
      true,
    ],
    [
      "admin-scoped API key",
      { kind: "api-key", user: TEST_USER, scope: "admin" } satisfies McpAuthContext,
      true,
    ],
    ["auth bypass", { kind: "bypass", user: TEST_USER } satisfies McpAuthContext, true],
  ])("enforces write-tool access for %s", async (_label, authContext, shouldAllowWrite) => {
    const { serverTransport, clientTransport } = createTransportPair();
    const server = createMcpServer(authContext, { includeTestWriteTool: true });
    const client = new Client({ name: "evidence-browser-test", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const readResult = await client.callTool({
        name: "get_bundle_schema",
        arguments: {},
      });
      const writeResult = await client.callTool({
        name: "__test_write_scope",
        arguments: {},
      });

      expect(readResult.isError).not.toBe(true);
      expect(writeResult.isError).toBe(shouldAllowWrite ? undefined : true);
      if (shouldAllowWrite) {
        expect(writeResult.content).toEqual([
          expect.objectContaining({
            type: "text",
            text: "write access granted",
          }),
        ]);
      } else {
        expect(writeResult.content).toEqual([
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining("requires upload or admin scope"),
          }),
        ]);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("creates an upload URL for upload-scoped API keys", async () => {
    const user = await createUser("upload-member", "password123", "user");
    createWorkspace("infra", "Infrastructure", "Ops workspace", user.id);

    const { serverTransport, clientTransport } = createTransportPair();
    const server = createMcpServer(
      {
        kind: "api-key",
        user: { id: user.id, username: "[api-key:eb_upload]", role: "user" },
        scope: "upload",
      },
      { origin: "https://evidence.example" }
    );
    const client = new Client({ name: "evidence-browser-test", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = await client.callTool({
        name: "create_upload_url",
        arguments: { workspace: "infra", bundleId: "run-42", ttlSeconds: 7200 },
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([expect.objectContaining({ type: "text" })]);
      const [{ text }] = result.content as Array<{ type: "text"; text: string }>;
      const payload = JSON.parse(text) as {
        uploadUrl: string;
        method: string;
        expiresAt: string;
        instructions: string;
      };
      expect(payload).toMatchObject({
        method: "POST",
      });
      expect(payload.uploadUrl).toMatch(/^https:\/\/evidence\.example\/api\/upload\/ebu1\./);
      expect(payload.instructions).toContain("curl -X POST");
      expect(payload.instructions).toContain("-F 'file=@bundle.zip'");
      expect(payload.instructions).toContain("pinned to 'run-42'");
      expect(new Date(payload.expiresAt).toString()).not.toBe("Invalid Date");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    ["instance key", { kind: "instance-key" } satisfies McpAuthContext],
    [
      "read-scoped API key",
      {
        kind: "api-key",
        user: TEST_USER,
        scope: "read",
      } satisfies McpAuthContext,
    ],
  ])("denies create_upload_url for %s", async (_label, authContext) => {
    const user = await createUser("read-member", "password123", "user");
    createWorkspace("infra", "Infrastructure", "Ops workspace", user.id);

    const { serverTransport, clientTransport } = createTransportPair();
    const server = createMcpServer(authContext);
    const client = new Client({ name: "evidence-browser-test", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = await client.callTool({
        name: "create_upload_url",
        arguments: { workspace: "infra" },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("requires upload or admin scope"),
        }),
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns bundle overview with manifest, metadata, tree, and inline index content", async () => {
    await seedBundleFixture({ username: "qa-agent" });
    await setExtractedBundle(
      {
        "index.md": "# QA Run\nAll checks passed.\n",
        "logs/output.log": "ok\n",
      },
      validManifest("QA Run")
    );

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "read" }, async (client) => {
      const result = await client.callTool({
        name: "get_bundle_overview",
        arguments: { workspace: "qa", bundleId: "run-1" },
      });

      expect(result.isError).not.toBe(true);
      const text = firstText(result);
      expect(text).toContain("# Bundle Overview");
      expect(text).toContain('"title": "QA Run"');
      expect(text).toContain('"uploadedBy": "qa-agent"');
      expect(text).toContain("- index.md");
      expect(text).toContain("- logs/");
      expect(text).toContain("# QA Run\nAll checks passed.");
      expect(extractorState.extractBundle).toHaveBeenCalledWith("qa/run-1");
    });
  });

  it("returns file tree only for get_bundle_tree", async () => {
    await seedBundleFixture({});
    await setExtractedBundle({
      "index.md": "# Index\n",
      "nested/a.txt": "A",
    });

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "upload" }, async (client) => {
      const result = await client.callTool({
        name: "get_bundle_tree",
        arguments: { workspace: "qa", bundleId: "run-1" },
      });

      expect(result.isError).not.toBe(true);
      const text = firstText(result);
      expect(text).toContain("# Bundle File Tree");
      expect(text).toContain("- index.md");
      expect(text).toContain("- nested/");
      expect(text).not.toContain("Manifest");
    });
  });

  it("reads text bundle files inline", async () => {
    await seedBundleFixture({});
    await setExtractedBundle({
      "index.md": "# Index\n",
      "notes.txt": "important note\n",
    });

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "admin" }, async (client) => {
      const result = await client.callTool({
        name: "read_bundle_file",
        arguments: { workspace: "qa", bundleId: "run-1", path: "notes.txt" },
      });

      expect(result.isError).not.toBe(true);
      const text = firstText(result);
      expect(text).toContain("Path: notes.txt");
      expect(text).toContain("Detected type: text");
      expect(text).toContain("important note");
    });
  });

  it("returns not-found errors before bundle extraction for unknown workspace or bundle", async () => {
    await seedBundleFixture({});

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "read" }, async (client) => {
      const missingOverviewWorkspace = await client.callTool({
        name: "get_bundle_overview",
        arguments: { workspace: "missing", bundleId: "run-1" },
      });
      const missingOverviewBundle = await client.callTool({
        name: "get_bundle_overview",
        arguments: { workspace: "qa", bundleId: "missing" },
      });
      const missingWorkspace = await client.callTool({
        name: "get_bundle_tree",
        arguments: { workspace: "missing", bundleId: "run-1" },
      });
      const missingBundle = await client.callTool({
        name: "read_bundle_file",
        arguments: { workspace: "qa", bundleId: "missing", path: "index.md" },
      });

      expect(missingOverviewWorkspace.isError).toBe(true);
      expect(firstText(missingOverviewWorkspace)).toContain('Workspace "missing" not found');
      expect(missingOverviewBundle.isError).toBe(true);
      expect(firstText(missingOverviewBundle)).toContain('Bundle "missing" not found');
      expect(missingWorkspace.isError).toBe(true);
      expect(firstText(missingWorkspace)).toContain('Workspace "missing" not found');
      expect(missingBundle.isError).toBe(true);
      expect(firstText(missingBundle)).toContain('Bundle "missing" not found');
      expect(extractorState.extractBundle).not.toHaveBeenCalled();
    });
  });

  it("rejects path traversal attempts through the existing file guard", async () => {
    await seedBundleFixture({});
    await setExtractedBundle({
      "index.md": "# Index\n",
    });

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "read" }, async (client) => {
      const result = await client.callTool({
        name: "read_bundle_file",
        arguments: { workspace: "qa", bundleId: "run-1", path: "../secret.txt" },
      });

      expect(result.isError).toBe(true);
      expect(firstText(result)).toContain("Invalid file path");
    });
  });

  it("returns metadata and web URL instead of bytes for binary files", async () => {
    await seedBundleFixture({});
    await setExtractedBundle({
      "index.md": "# Index\n",
      "screenshots/step.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "read" }, async (client) => {
      const result = await client.callTool({
        name: "read_bundle_file",
        arguments: { workspace: "qa", bundleId: "run-1", path: "screenshots/step.png" },
      });

      expect(result.isError).not.toBe(true);
      const text = firstText(result);
      expect(text).toContain("Inline content unavailable");
      expect(text).toContain("Reason: binary");
      expect(text).toContain("Web URL: /w/qa/b/run-1/f?path=screenshots%2Fstep.png");
      expect(text).not.toContain("PNG");
    });
  });

  it("rejects directory paths for read_bundle_file", async () => {
    await seedBundleFixture({});
    await setExtractedBundle({
      "index.md": "# Index\n",
      "logs/output.log": "ok\n",
    });

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "read" }, async (client) => {
      const result = await client.callTool({
        name: "read_bundle_file",
        arguments: { workspace: "qa", bundleId: "run-1", path: "logs" },
      });

      expect(result.isError).toBe(true);
      expect(firstText(result)).toContain('Path "logs" is not a file');
    });
  });

  it("returns metadata and web URL instead of bytes for oversized text files", async () => {
    await seedBundleFixture({});
    await setExtractedBundle({
      "index.md": "# Index\n",
      "large.log": "x".repeat(256 * 1024 + 1),
    });

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "read" }, async (client) => {
      const result = await client.callTool({
        name: "read_bundle_file",
        arguments: { workspace: "qa", bundleId: "run-1", path: "large.log" },
      });

      expect(result.isError).not.toBe(true);
      const text = firstText(result);
      expect(text).toContain("Reason: oversized");
      expect(text).toContain("Size: 262145 bytes");
      expect(text).toContain("Web URL: /w/qa/b/run-1/f?path=large.log");
      expect(text).not.toContain("x".repeat(100));
    });
  });

  it("filters list_bundles by uploader and upload time window", async () => {
    const qaUser = await createUser("qa-agent", "password123", "user");
    const devUser = await createUser("dev-agent", "password123", "user");
    const workspace = createWorkspace("qa", "QA", "QA workspace", qaUser.id);
    const oldBundle = createBundle({
      bundleId: "old",
      workspaceId: workspace.id,
      title: "Old",
      storageKey: "qa/old",
      sizeBytes: 128,
      uploadedBy: qaUser.id,
    });
    const newBundle = createBundle({
      bundleId: "new",
      workspaceId: workspace.id,
      title: "New",
      storageKey: "qa/new",
      sizeBytes: 512,
      uploadedBy: qaUser.id,
    });
    const devBundle = createBundle({
      bundleId: "dev",
      workspaceId: workspace.id,
      title: "Dev",
      storageKey: "qa/dev",
      sizeBytes: 256,
      uploadedBy: devUser.id,
    });
    testDb.prepare("UPDATE bundles SET created_at = ? WHERE id = ?").run("2026-08-01 00:00:00", oldBundle.id);
    testDb.prepare("UPDATE bundles SET created_at = ? WHERE id = ?").run("2026-08-10 00:00:00", newBundle.id);
    testDb.prepare("UPDATE bundles SET created_at = ? WHERE id = ?").run("2026-08-11 00:00:00", devBundle.id);

    await withMcpClient({ kind: "api-key", user: TEST_USER, scope: "read" }, async (client) => {
      const result = await client.callTool({
        name: "list_bundles",
        arguments: {
          workspace: "qa",
          uploadedBy: "qa-agent",
          since: "2026-08-05T00:00:00Z",
          until: "2026-08-12T00:00:00Z",
          limit: 5,
        },
      });

      expect(result.isError).not.toBe(true);
      const payload = JSON.parse(firstText(result)) as {
        bundles: Array<{
          bundleId: string;
          title: string;
          uploadedBy: string;
          createdAt: string;
          sizeBytes: number;
        }>;
        filters: { limit: number };
      };
      expect(payload.bundles).toEqual([
        {
          bundleId: "new",
          title: "New",
          uploadedBy: "qa-agent",
          createdAt: "2026-08-10 00:00:00",
          sizeBytes: 512,
        },
      ]);
      expect(payload.filters.limit).toBe(5);
    });
  });
});
