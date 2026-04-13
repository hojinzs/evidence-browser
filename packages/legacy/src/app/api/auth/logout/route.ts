import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  logout,
  clearSessionCookie,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (cookie?.value) {
    logout(cookie.value);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response.headers);
  return response;
}
