import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { countAdmins, createUser } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";
import { signSessionId, SESSION_COOKIE_NAME } from "@/lib/auth";
import { requireAdmin, type AppVariables } from "@/middleware/auth";
import { createWorkspace, findWorkspaceBySlug, listWorkspaces } from "@/lib/db/workspaces";
import { getStorageAdapter } from "@/lib/storage";
import { getEnv } from "@/config/env";

const setup = new Hono<{ Variables: AppVariables }>();

setup.get("/status", (c) => {
  const hasAdmin = countAdmins() > 0;
  const hasWorkspace = listWorkspaces().length > 0;
  return c.json({
    needsSetup: !hasAdmin || !hasWorkspace,
    hasAdmin,
    hasWorkspace,
  });
});

setup.post("/admin", async (c) => {
  if (countAdmins() > 0) {
    return c.json({ error: "Admin already exists" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  if (typeof body.password !== "string" || body.password.length < 4) {
    return c.json({ error: "Password must be at least 4 characters" }, 400);
  }

  try {
    const user = await createUser(body.username, body.password, "admin");
    const session = createSession(user.id);
    const signedSessionId = signSessionId(session.id);

    setCookie(c, SESSION_COOKIE_NAME, signedSessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === "production",
    });
    return c.json({ user });
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "Username already exists" }, 409);
    }
    throw err;
  }
});

setup.post("/workspace", requireAdmin, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body?.slug || !body?.name) {
    return c.json({ error: "slug and name are required" }, 400);
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
    return c.json(
      { error: "Slug must be lowercase alphanumeric with hyphens (e.g. my-workspace)" },
      400
    );
  }

  if (findWorkspaceBySlug(body.slug)) {
    return c.json({ error: "Workspace with this slug already exists" }, 409);
  }

  const workspace = createWorkspace(
    body.slug,
    body.name,
    typeof body.description === "string" ? body.description : "",
    user.id
  );

  return c.json({ workspace });
});

setup.post("/verify-storage", requireAdmin, async (c) => {
  try {
    const env = getEnv();
    const adapter = getStorageAdapter();

    let bundles: string[] = [];
    if (adapter.listBundles) {
      bundles = await adapter.listBundles();
    }

    return c.json({
      ok: true,
      storageType: env.STORAGE_TYPE,
      bundleCount: bundles.length,
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Storage connection failed",
      },
      400
    );
  }
});

export const setupRoutes = setup;
