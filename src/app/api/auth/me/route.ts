import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, validateSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = validateSession(cookie.value);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
