import { NextRequest, NextResponse } from "next/server";
import { validateSessionFromRequest } from "@/lib/auth/require-auth";
import { createWorkspace, findWorkspaceBySlug } from "@/lib/db/workspaces";

export async function POST(request: NextRequest) {
  const user = validateSessionFromRequest(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.slug || !body?.name) {
    return NextResponse.json(
      { error: "slug and name are required" },
      { status: 400 }
    );
  }

  // Validate slug format
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase alphanumeric with hyphens (e.g. my-workspace)" },
      { status: 400 }
    );
  }

  // Check uniqueness
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

  return NextResponse.json({ workspace });
}
