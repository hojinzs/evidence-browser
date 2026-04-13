import { Hono } from "hono";
import { authenticate, requireAdmin, type AppVariables } from "@/middleware/auth";
import { createApiKey, deleteApiKey, listAllApiKeys, listApiKeysByUser } from "@/lib/db/api-keys";

const VALID_SCOPES = ["read", "upload", "admin"] as const;
type Scope = (typeof VALID_SCOPES)[number];

function isValidScope(value: unknown): value is Scope {
  return VALID_SCOPES.includes(value as Scope);
}

const apiKeys = new Hono<{ Variables: AppVariables }>();

apiKeys.get("/", authenticate, (c) => {
  return c.json({ keys: listApiKeysByUser(c.get("user").id) });
});

apiKeys.post("/", authenticate, async (c) => {
  const authUser = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Invalid request body" }, 400);

  const { name, scope, userId: requestedUserId, expiresAt } = body as Record<string, unknown>;
  if (!name || typeof name !== "string" || name.trim() === "") {
    return c.json({ error: "name is required" }, 400);
  }
  if (!isValidScope(scope)) {
    return c.json({ error: "scope must be one of: read, upload, admin" }, 400);
  }
  if (requestedUserId !== undefined && requestedUserId !== authUser.id && authUser.role !== "admin") {
    return c.json({ error: "Forbidden: cannot create key for another user" }, 403);
  }

  const targetUserId = typeof requestedUserId === "string" ? requestedUserId : authUser.id;
  const expiresAtValue = typeof expiresAt === "string" ? expiresAt : undefined;

  try {
    const { key, record } = createApiKey(targetUserId, name.trim(), scope, expiresAtValue);
    return c.json({ key, record }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("FOREIGN KEY")) {
      return c.json({ error: "User not found" }, 404);
    }
    throw err;
  }
});

apiKeys.delete("/:id", authenticate, (c) => {
  const authUser = c.get("user");
  const deleted = deleteApiKey(c.req.param("id"), authUser.id, authUser.role === "admin");
  if (!deleted) return c.json({ error: "API key not found" }, 404);
  return c.body(null, 204);
});

apiKeys.get("/admin/all", requireAdmin, (c) => {
  return c.json({ keys: listAllApiKeys() });
});

export const apiKeyRoutes = apiKeys;
