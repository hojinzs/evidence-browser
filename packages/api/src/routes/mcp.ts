import { timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getEnv } from "@/config/env";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { createMcpServer } from "@/lib/mcp/server";
import { extractBearerToken, getApiKeyUser } from "@/middleware/auth";

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

// Exported for focused route auth tests without starting an MCP transport.
export function checkAuth(request: Request): Response | null {
  if (isAuthBypassEnabled()) return null;

  const token = extractBearerToken(request.headers.get("authorization"));

  if (token?.startsWith("eb_")) {
    if (!getApiKeyUser(token)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return null;
  }

  const env = getEnv();
  if (env.MCP_API_KEY) {
    if (!token || !timingSafeStringEqual(token, env.MCP_API_KEY)) {
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
