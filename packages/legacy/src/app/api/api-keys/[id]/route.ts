import { NextRequest, NextResponse } from "next/server";
import { requireAuthFromRequest } from "@/lib/auth/require-auth";
import { deleteApiKey } from "@/lib/db/api-keys";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** DELETE /api/api-keys/:id — delete own key or any key (admin) */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authResult = requireAuthFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const { id } = await params;
  const isAdmin = authResult.role === "admin";

  const deleted = deleteApiKey(id, authResult.id, isAdmin);
  if (!deleted) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
