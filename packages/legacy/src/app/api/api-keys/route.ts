import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthFromRequest,
} from "@/lib/auth/require-auth";
import {
  createApiKey,
  listApiKeysByUser,
} from "@/lib/db/api-keys";

const VALID_SCOPES = ["read", "upload", "admin"] as const;
type Scope = (typeof VALID_SCOPES)[number];

function isValidScope(value: unknown): value is Scope {
  return VALID_SCOPES.includes(value as Scope);
}

/** GET /api/api-keys — list the authenticated user's own API keys */
export async function GET(request: NextRequest) {
  const authResult = requireAuthFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const keys = listApiKeysByUser(authResult.id);
  return NextResponse.json({ keys });
}

/** POST /api/api-keys — create a new API key */
export async function POST(request: NextRequest) {
  const authResult = requireAuthFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, scope, userId: requestedUserId, expiresAt } = body as Record<
    string,
    unknown
  >;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!isValidScope(scope)) {
    return NextResponse.json(
      { error: "scope must be one of: read, upload, admin" },
      { status: 400 }
    );
  }

  // Non-admin users cannot assign keys to other users
  if (requestedUserId !== undefined && requestedUserId !== authResult.id) {
    if (authResult.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: cannot create key for another user" },
        { status: 403 }
      );
    }
  }

  const targetUserId =
    typeof requestedUserId === "string" ? requestedUserId : authResult.id;

  const expiresAtValue =
    typeof expiresAt === "string" ? expiresAt : undefined;

  try {
    const { key, record } = createApiKey(
      targetUserId,
      name.trim(),
      scope,
      expiresAtValue
    );
    return NextResponse.json({ key, record }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("FOREIGN KEY")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    throw err;
  }
}
