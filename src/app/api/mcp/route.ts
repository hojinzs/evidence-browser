import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getEnv } from "@/config/env";
import { createMcpServer } from "@/lib/mcp/server";
import {
  findApiKeyByHash,
  updateApiKeyLastUsed,
} from "@/lib/db/api-keys";

function checkAuth(request: Request): Response | null {
  const auth = request.headers.get("authorization");

  // Priority 1: Bearer eb_... token — validate against DB
  if (auth && auth.startsWith("Bearer eb_")) {
    const rawKey = auth.slice("Bearer ".length);
    const apiKey = findApiKeyByHash(rawKey);
    if (!apiKey) {
      // Key provided but invalid/expired — reject
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Key is valid — update last_used_at and allow
    updateApiKeyLastUsed(apiKey.id);
    return null;
  }

  // Priority 2: Fall back to MCP_API_KEY env var (legacy behaviour)
  const env = getEnv();
  if (env.MCP_API_KEY) {
    if (!auth || auth !== `Bearer ${env.MCP_API_KEY}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Priority 3: No auth configured — pass through
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

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
