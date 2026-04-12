import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/auth/require-auth";
import { listUsers, createUser } from "@/lib/db/users";

export async function GET(request: NextRequest) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const users = listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const body = await request.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const role = body.role === "admin" ? "admin" : "user";

  try {
    const user = await createUser(body.username, body.password, role);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    throw err;
  }
}
