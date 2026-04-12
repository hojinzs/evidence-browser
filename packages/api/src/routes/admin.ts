import { Hono } from "hono";
import { requireAdmin, type AppVariables } from "@/middleware/auth";
import { listAllApiKeys } from "@/lib/db/api-keys";
import { createUser, deleteUser, listUsers, updateUserRole } from "@/lib/db/users";

const admin = new Hono<{ Variables: AppVariables }>();

admin.get("/api-keys", requireAdmin, (c) => c.json({ keys: listAllApiKeys() }));

admin.get("/users", requireAdmin, (c) => c.json({ users: listUsers() }));

admin.post("/users", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return c.json({ error: "username and password required" }, 400);
  }

  const role = body.role === "admin" ? "admin" : "user";
  try {
    const user = await createUser(body.username, body.password, role);
    return c.json({ user }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "Username already exists" }, 409);
    }
    throw err;
  }
});

admin.patch("/users/:id", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const role = body?.role;
  if (role !== "admin" && role !== "user") return c.json({ error: "Invalid request" }, 400);

  const updated = updateUserRole(c.req.param("id"), role);
  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ ok: true });
});

admin.delete("/users/:id", requireAdmin, (c) => {
  const adminUser = c.get("user");
  const id = c.req.param("id");
  if (id === adminUser.id) return c.json({ error: "Cannot delete yourself" }, 400);
  const deleted = deleteUser(id);
  if (!deleted) return c.json({ error: "User not found" }, 404);
  return c.json({ ok: true });
});

export const adminRoutes = admin;
