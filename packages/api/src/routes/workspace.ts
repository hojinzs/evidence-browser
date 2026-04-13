import { Hono } from "hono";
import { authenticate, requireAdmin, type AppVariables } from "@/middleware/auth";
import {
  listWorkspacesWithBundleCount,
  createWorkspace,
  findWorkspaceBySlug,
  deleteWorkspace,
} from "@/lib/db/workspaces";

const workspace = new Hono<{ Variables: AppVariables }>();

workspace.get("/", authenticate, (c) => {
  return c.json({ workspaces: listWorkspacesWithBundleCount() });
});

workspace.post("/", requireAdmin, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body?.slug || !body?.name) {
    return c.json({ error: "slug and name are required" }, 400);
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
    return c.json({ error: "Slug must be lowercase alphanumeric with hyphens" }, 400);
  }

  if (findWorkspaceBySlug(body.slug)) {
    return c.json({ error: "Workspace with this slug already exists" }, 409);
  }

  const workspace = createWorkspace(body.slug, body.name, body.description || "", user.id);
  return c.json({ workspace }, 201);
});

workspace.delete("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.id) return c.json({ error: "id is required" }, 400);

  const deleted = deleteWorkspace(body.id);
  if (!deleted) return c.json({ error: "Workspace not found" }, 404);
  return c.json({ success: true });
});

export const workspaceRoutes = workspace;
