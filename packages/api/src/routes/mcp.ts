import { timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getEnv } from "@/config/env";
import { getAuthBypassUser, isAuthBypassEnabled } from "@/lib/auth/bypass";
import { createMcpServer, type McpAuthContext } from "@/lib/mcp/server";
import { authenticateApiKey, extractBearerToken } from "@/middleware/auth";

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveMcpAuthContextSync(request: Request): McpAuthContext | Response {
  const token = extractBearerToken(request.headers.get("authorization"));

  if (token?.startsWith("eb_")) {
    const apiKeyAuth = authenticateApiKey(token);
    if (!apiKeyAuth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return { kind: "api-key", user: apiKeyAuth.user, scope: apiKeyAuth.scope };
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

  return { kind: "instance-key" };
}

export async function resolveMcpAuthContext(request: Request): Promise<McpAuthContext | Response> {
  if (isAuthBypassEnabled()) {
    return { kind: "bypass", user: await getAuthBypassUser() };
  }

  return resolveMcpAuthContextSync(request);
}

// Exported for focused route auth tests without starting an MCP transport.
export function checkAuth(request: Request): Response | null {
  if (isAuthBypassEnabled()) return null;
  const authContext = resolveMcpAuthContextSync(request);
  if (authContext instanceof Response) return authContext;
  return null;
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const authContext = await resolveMcpAuthContext(request);
  if (authContext instanceof Response) return authContext;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer(authContext, { origin: new URL(request.url).origin });
  await server.connect(transport);

  return transport.handleRequest(request);
}

const mcp = new Hono();

mcp.get("/", (c) => handleMcpRequest(c.req.raw));
mcp.post("/", (c) => handleMcpRequest(c.req.raw));
mcp.delete("/", (c) => handleMcpRequest(c.req.raw));

export const mcpRoutes = mcp;
