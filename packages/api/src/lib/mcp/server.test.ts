import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, describe, expect, it } from "vitest";
import { resetEnv } from "@/config/env";
import { createMcpServer } from "./server";

class MemoryTransport implements Transport {
  peer: MemoryTransport | null = null;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    // No connection setup is required for in-memory test transport.
  }

  async send(message: JSONRPCMessage): Promise<void> {
    queueMicrotask(() => {
      this.peer?.onmessage?.(message);
    });
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

function createTransportPair() {
  const serverTransport = new MemoryTransport();
  const clientTransport = new MemoryTransport();
  serverTransport.peer = clientTransport;
  clientTransport.peer = serverTransport;
  return { serverTransport, clientTransport };
}

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
  resetEnv();
}

describe("createMcpServer", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("lists registered tools and resources, then invokes a minimal tool", async () => {
    process.env.STORAGE_TYPE = "local";
    process.env.STORAGE_LOCAL_PATH = "/tmp/evidence-bundles";
    resetEnv();

    const { serverTransport, clientTransport } = createTransportPair();
    const server = createMcpServer();
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
});
