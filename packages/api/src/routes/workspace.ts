import { Hono } from "hono";
import { authenticate, requireAdmin, type AppVariables } from "@/middleware/auth";
import {
  listWorkspacesWithBundleCount,
  createWorkspace,
  findWorkspaceBySlug,
  deleteWorkspace,
  updateWorkspace,
  deleteWorkspaceBySlug,
} from "@/lib/db/workspaces";

const workspace = new Hono<{ Variables: AppVariables }>();

workspace.get("/", authenticate, (c) => {
  return c.json({ workspaces: listWorkspacesWithBundleCount() });
});

workspace.get("/:slug", authenticate, (c) => {
  const workspace = findWorkspaceBySlug(c.req.param("slug"));
  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json({ workspace });
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

workspace.patch("/:id", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const allowedKeys = ["name", "description"];
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0) {
    return c.json({ error: "At least one of name or description is required" }, 400);
  }
  if (keys.some((key) => !allowedKeys.includes(key))) {
    return c.json({ error: "name and description are the only allowed fields" }, 400);
  }

  const { name, description } = body as Record<string, unknown>;
  const updates: { name?: string; description?: string } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return c.json({ error: "name must be a non-empty string" }, 400);
    }
    updates.name = name.trim();
  }

  if (description !== undefined) {
    if (typeof description !== "string") {
      return c.json({ error: "description must be a string" }, 400);
    }
    updates.description = description;
  }

  const result = updateWorkspace(c.req.param("id"), updates);
  if (result.status === "not_found") {
    return c.json({ error: "Workspace not found" }, 404);
  }
  if (result.status === "no_fields") {
    return c.json({ error: "At least one of name or description is required" }, 400);
  }

  return c.json({ workspace: result.workspace });
});

workspace.delete("/:slug", requireAdmin, (c) => {
  const deleted = deleteWorkspaceBySlug(c.req.param("slug"));
  if (!deleted) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json({ success: true });
});

export const workspaceRoutes = workspace;
