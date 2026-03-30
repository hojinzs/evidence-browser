import { generateLlmText } from "@/lib/mcp/llm-text";

export async function GET() {
  return new Response(generateLlmText(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
