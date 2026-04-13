import { SESSION_COOKIE_NAME, validateSession } from "./index";
import type { AuthUser } from "./types";

export function validateSessionFromRequest(request: Request): AuthUser | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const prefix = `${SESSION_COOKIE_NAME}=`;
  const parts = cookieHeader.split(";").map((segment) => segment.trim());
  const match = parts.find((segment) => segment.startsWith(prefix));
  if (!match) return null;

  const value = decodeURIComponent(match.slice(prefix.length));
  return validateSession(value);
}
