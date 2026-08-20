import type Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { createTestDb } from "@/lib/db/index";
import { createUser } from "@/lib/db/users";
import { createWorkspace } from "@/lib/db/workspaces";
import { createTransportPair } from "@/lib/mcp/test-transport";
import { createMcpServer, type McpAuthContext } from "./server";

let testDb: Database.Database;

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

const TEST_USER = { id: "user-1", username: "member", role: "user" as const };

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
  resetEnv();
}

describe("createMcpServer", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    restoreEnv();
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
});
