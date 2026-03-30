import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getEnv } from "@/config/env";
import { createMcpServer } from "@/lib/mcp/server";

function checkAuth(request: Request): Response | null {
  const env = getEnv();
  if (!env.MCP_API_KEY) return null;

  const auth = request.headers.get("authorization");
  if (!auth || auth !== `Bearer ${env.MCP_API_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
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

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
