import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  validateSession,
} from "./index";
import type { AuthUser } from "./types";

/** Get current user from session cookie. Returns null if not authenticated. */
export async function getOptionalAuth(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return null;
  return validateSession(cookie.value);
}

/** Require authentication. Redirects to /login if not authenticated. */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getOptionalAuth();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Require admin role. Redirects to /login if not authenticated or not admin. */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== "admin") {
    redirect("/");
  }
  return user;
}

/** Validate session from API request. Returns user or null. */
export function validateSessionFromRequest(
  request: Request
): AuthUser | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const prefix = `${SESSION_COOKIE_NAME}=`;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  const match = parts.find((p) => p.startsWith(prefix));
  if (!match) return null;

  const value = decodeURIComponent(match.slice(prefix.length));
  return validateSession(value);
}

/** Require auth from API request. Returns user or Response(401). */
export function requireAuthFromRequest(
  request: Request
): AuthUser | Response {
  const user = validateSessionFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/** Require admin from API request. Returns user or Response(401/403). */
export function requireAdminFromRequest(
  request: Request
): AuthUser | Response {
  const result = requireAuthFromRequest(request);
  if (result instanceof Response) return result;
  if (result.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}
