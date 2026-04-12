import { createHmac } from "crypto";
import { getEnv } from "@/config/env";
import {
  findUserByUsername,
  verifyPassword,
  findUserById,
} from "@/lib/db/users";
import {
  createSession as dbCreateSession,
  findSession as dbFindSession,
  deleteSession as dbDeleteSession,
} from "@/lib/db/sessions";
import type { AuthUser } from "./types";

export const SESSION_COOKIE_NAME = "evidence_session";

function getAuthSecret(): string {
  return getEnv().AUTH_SECRET;
}

/** Sign a session ID with HMAC-SHA256 */
export function signSessionId(sessionId: string): string {
  const hmac = createHmac("sha256", getAuthSecret());
  hmac.update(sessionId);
  const signature = hmac.digest("hex");
  return `${sessionId}.${signature}`;
}

/** Verify a signed cookie value and extract the session ID */
export function verifySignedCookie(cookieValue: string): string | null {
  const dotIndex = cookieValue.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const sessionId = cookieValue.slice(0, dotIndex);
  const signature = cookieValue.slice(dotIndex + 1);

  const hmac = createHmac("sha256", getAuthSecret());
  hmac.update(sessionId);
  const expected = hmac.digest("hex");

  // Constant-time comparison
  if (signature.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0 ? sessionId : null;
}

/** Attempt login. Returns AuthUser on success, null on failure. */
export async function login(
  username: string,
  password: string
): Promise<{ user: AuthUser; signedSessionId: string } | null> {
  const user = findUserByUsername(username);
  if (!user) return null;

  const valid = await verifyPassword(password, user.password);
  if (!valid) return null;

  const session = dbCreateSession(user.id);
  const signedSessionId = signSessionId(session.id);

  return {
    user: { id: user.id, username: user.username, role: user.role },
    signedSessionId,
  };
}

/** Delete session by signed cookie value */
export function logout(signedCookie: string): boolean {
  const sessionId = verifySignedCookie(signedCookie);
  if (!sessionId) return false;
  return dbDeleteSession(sessionId);
}

/** Validate session from signed cookie value. Returns user or null. */
export function validateSession(signedCookie: string): AuthUser | null {
  const sessionId = verifySignedCookie(signedCookie);
  if (!sessionId) return null;

  const session = dbFindSession(sessionId);
  if (!session) return null;

  const user = findUserById(session.user_id);
  if (!user) return null;

  return { id: user.id, username: user.username, role: user.role };
}

/** Get session cookie value from request headers */
export function getSessionCookieFromHeaders(
  headerCookie: string | null
): string | null {
  if (!headerCookie) return null;
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const parts = headerCookie.split(";").map((s) => s.trim());
  const match = parts.find((p) => p.startsWith(prefix));
  if (!match) return null;
  return decodeURIComponent(match.slice(prefix.length));
}

/** Quick HMAC-only verification (for middleware, no DB). */
export function verifySessionCookieSignature(cookieValue: string): boolean {
  return verifySignedCookie(cookieValue) !== null;
}

/** Set session cookie on a Response */
export function setSessionCookie(
  headers: Headers,
  signedSessionId: string
): void {
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedSessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

/** Clear session cookie on a Response */
export function clearSessionCookie(headers: Headers): void {
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}
