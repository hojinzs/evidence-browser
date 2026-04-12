import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getEnv } from "@/config/env";
import { createMcpServer } from "@/lib/mcp/server";
import { findApiKeyByHash, updateApiKeyLastUsed } from "@/lib/db/api-keys";

function checkAuth(request: Request): Response | null {
  const auth = request.headers.get("authorization");

  if (auth && auth.startsWith("Bearer eb_")) {
    const rawKey = auth.slice("Bearer ".length);
    const apiKey = findApiKeyByHash(rawKey);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    updateApiKeyLastUsed(apiKey.id);
    return null;
  }

  const env = getEnv();
  if (env.MCP_API_KEY) {
    if (!auth || auth !== `Bearer ${env.MCP_API_KEY}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return null;
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const authError = checkAuth(request);
  if (authError) return authError;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);

  return transport.handleRequest(request);
}

const mcp = new Hono();

mcp.get("/", (c) => handleMcpRequest(c.req.raw));
mcp.post("/", (c) => handleMcpRequest(c.req.raw));
mcp.delete("/", (c) => handleMcpRequest(c.req.raw));

export const mcpRoutes = mcp;
