import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/auth/require-auth";
import { updateUserRole, deleteUser } from "@/lib/db/users";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body?.role && (body.role === "admin" || body.role === "user")) {
    const updated = updateUserRole(id, body.role);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;
  const adminUser = authResult;

  const { id } = await params;

  // Prevent self-deletion
  if (id === adminUser.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const deleted = deleteUser(id);
  if (!deleted) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
