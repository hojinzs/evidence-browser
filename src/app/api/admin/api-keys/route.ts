import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/auth/require-auth";
import { listAllApiKeys } from "@/lib/db/api-keys";

/** GET /api/admin/api-keys — list all API keys across all users (admin only) */
export async function GET(request: NextRequest) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const keys = listAllApiKeys();
  return NextResponse.json({ keys });
}
