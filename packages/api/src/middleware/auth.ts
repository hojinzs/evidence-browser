import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { findApiKeyByHash, updateApiKeyLastUsed } from "@/lib/db/api-keys";
import { validateSessionFromRequest } from "@/lib/auth/request-auth";
import {
  getAuthBypassUser,
  isAuthBypassEnabled,
  isAuthBypassUserId,
} from "@/lib/auth/bypass";
import type { AuthUser } from "@/lib/auth/types";

export type ScopedApiKeyScope = "read" | "upload" | "admin";
export type AppVariables = { user: AuthUser; apiKeyScope?: ScopedApiKeyScope };
type Role = AuthUser["role"];

type ScopeOptions = {
  apiKeyScopes: ScopedApiKeyScope[];
  sessionRoles: Role[];
};

type AuthenticatedApiKey = { user: AuthUser; scope: ScopedApiKeyScope };

export function authenticateApiKey(rawKey: string): AuthenticatedApiKey | null {
  const apiKey = findApiKeyByHash(rawKey);
  if (!apiKey) return null;
  if (isAuthBypassUserId(apiKey.user_id)) return null;

  updateApiKeyLastUsed(apiKey.id);
  return {
    user: {
      id: apiKey.user_id,
      username: `[api-key:${apiKey.key_prefix}]`,
      role: apiKey.scope === "admin" ? "admin" : "user",
    },
    scope: apiKey.scope,
  };
}

export function getApiKeyUser(rawKey: string): AuthenticatedApiKey | null {
  return authenticateApiKey(rawKey);
}

export function extractBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

async function applyAuthBypass(c: Context<{ Variables: AppVariables }>, next: Next) {
  c.set("user", await getAuthBypassUser());
  c.set("apiKeyScope", "admin");
  await next();
}

export function requireScope({ apiKeyScopes, sessionRoles }: ScopeOptions) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (isAuthBypassEnabled()) {
      await applyAuthBypass(c, next);
      return;
    }

    const token = extractBearerToken(c.req.header("authorization"));
    if (token?.startsWith("eb_")) {
      const apiKeyUser = authenticateApiKey(token);
      if (!apiKeyUser) return c.json({ error: "Unauthorized" }, 401);
      if (!apiKeyScopes.includes(apiKeyUser.scope)) {
        return c.json({ error: "Forbidden: insufficient scope" }, 403);
      }
      c.set("user", apiKeyUser.user);
      c.set("apiKeyScope", apiKeyUser.scope);
      await next();
      return;
    }

    const user = validateSessionFromRequest(c.req.raw);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!sessionRoles.includes(user.role)) return c.json({ error: "Forbidden" }, 403);
    c.set("user", user);
    await next();
  });
}

export const authenticate = requireScope({
  apiKeyScopes: ["read", "upload", "admin"],
  sessionRoles: ["user", "admin"],
});

export const requireAdmin = requireScope({
  apiKeyScopes: ["admin"],
  sessionRoles: ["admin"],
});

export const requireUpload = requireScope({
  apiKeyScopes: ["upload", "admin"],
  sessionRoles: ["admin"],
});
