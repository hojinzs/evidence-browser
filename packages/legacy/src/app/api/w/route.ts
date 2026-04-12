import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthFromRequest,
  requireAdminFromRequest,
} from "@/lib/auth/require-auth";
import {
  listWorkspacesWithBundleCount,
  createWorkspace,
  findWorkspaceBySlug,
  deleteWorkspace,
} from "@/lib/db/workspaces";

export async function GET(request: NextRequest) {
  const authResult = requireAuthFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const workspaces = listWorkspacesWithBundleCount();
  return NextResponse.json({ workspaces });
}

export async function POST(request: NextRequest) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const body = await request.json().catch(() => null);
  if (!body?.slug || !body?.name) {
    return NextResponse.json(
      { error: "slug and name are required" },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase alphanumeric with hyphens" },
      { status: 400 }
    );
  }

  if (findWorkspaceBySlug(body.slug)) {
    return NextResponse.json(
      { error: "Workspace with this slug already exists" },
      { status: 409 }
    );
  }

  const workspace = createWorkspace(
    body.slug,
    body.name,
    body.description || "",
    user.id
  );

  return NextResponse.json({ workspace }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const body = await request.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const deleted = deleteWorkspace(body.id);
  if (!deleted) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
