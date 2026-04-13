import { createMiddleware } from "hono/factory";
import { findApiKeyByHash, updateApiKeyLastUsed } from "@/lib/db/api-keys";
import { validateSessionFromRequest } from "@/lib/auth/request-auth";
import type { AuthUser } from "@/lib/auth/types";

type ScopedApiKeyScope = "read" | "upload" | "admin";
export type AppVariables = { user: AuthUser; apiKeyScope?: ScopedApiKeyScope };

function getApiKeyUser(rawKey: string): { user: AuthUser; scope: ScopedApiKeyScope } | null {
  const apiKey = findApiKeyByHash(rawKey);
  if (!apiKey) return null;

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

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

export const authenticate = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const token = extractBearerToken(c.req.header("authorization"));
  if (token?.startsWith("eb_")) {
    const apiKeyUser = getApiKeyUser(token);
    if (!apiKeyUser) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", apiKeyUser.user);
    c.set("apiKeyScope", apiKeyUser.scope);
    await next();
    return;
  }

  const user = validateSessionFromRequest(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
});

export const requireAdmin = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const token = extractBearerToken(c.req.header("authorization"));
  if (token?.startsWith("eb_")) {
    const apiKeyUser = getApiKeyUser(token);
    if (!apiKeyUser) return c.json({ error: "Unauthorized" }, 401);
    if (apiKeyUser.scope !== "admin") {
      return c.json({ error: "Forbidden: insufficient scope" }, 403);
    }
    c.set("user", apiKeyUser.user);
    c.set("apiKeyScope", apiKeyUser.scope);
    await next();
    return;
  }

  const user = validateSessionFromRequest(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  c.set("user", user);
  await next();
});

export const requireUpload = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const token = extractBearerToken(c.req.header("authorization"));
  if (token?.startsWith("eb_")) {
    const apiKeyUser = getApiKeyUser(token);
    if (!apiKeyUser) return c.json({ error: "Unauthorized" }, 401);
    if (apiKeyUser.scope !== "upload" && apiKeyUser.scope !== "admin") {
      return c.json({ error: "Forbidden: insufficient scope" }, 403);
    }
    c.set("user", apiKeyUser.user);
    c.set("apiKeyScope", apiKeyUser.scope);
    await next();
    return;
  }

  const user = validateSessionFromRequest(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  c.set("user", user);
  await next();
});
