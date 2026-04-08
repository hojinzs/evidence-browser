import { NextRequest, NextResponse } from "next/server";
import { countAdmins, createUser } from "@/lib/db/users";
import { signSessionId } from "@/lib/auth";
import { setSessionCookie } from "@/lib/auth";
import { createSession } from "@/lib/db/sessions";

export async function POST(request: NextRequest) {
  // Only allow when no admin exists
  if (countAdmins() > 0) {
    return NextResponse.json(
      { error: "Admin already exists" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return NextResponse.json(
      { error: "username and password are required" },
      { status: 400 }
    );
  }

  if (body.password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters" },
      { status: 400 }
    );
  }

  const user = await createUser(body.username, body.password, "admin");

  // Auto-login: create session
  const session = createSession(user.id);
  const signedSessionId = signSessionId(session.id);

  const response = NextResponse.json({ user });
  setSessionCookie(response.headers, signedSessionId);
  return response;
}
