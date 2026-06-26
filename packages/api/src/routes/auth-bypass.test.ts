import type Database from "better-sqlite3";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../lib/db/index";

let testDb: Database.Database;

vi.mock("../lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

import { resetEnv } from "@/config/env";
import { AUTH_BYPASS_USERNAME, resetAuthBypassUserCache } from "@/lib/auth/bypass";
import { createBundle } from "@/lib/db/bundles";
import { createBundleShareToken } from "@/lib/db/share-tokens";
import { findUserByUsername } from "@/lib/db/users";
import { createWorkspace } from "@/lib/db/workspaces";
import { requireUpload, type AppVariables } from "@/middleware/auth";
import { apiKeyRoutes } from "./api-keys";
import { authRoutes } from "./auth";
import { bundleRoutes } from "./bundle";
import { checkAuth as checkMcpAuth } from "./mcp";
import { setupRoutes } from "./setup";
import { workspaceRoutes } from "./workspace";

function createTestApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/api/auth", authRoutes);
  app.route("/api/api-keys", apiKeyRoutes);
  app.route("/api/setup", setupRoutes);
  app.route("/api/w", workspaceRoutes);
  app.route("/api/w", bundleRoutes);
  app.post("/api/upload-check", requireUpload, (c) => c.json({ user: c.get("user") }));
  return app;
}

describe("AUTH_BYPASS", () => {
  const originalAuthBypass = process.env.AUTH_BYPASS;
  const originalMcpApiKey = process.env.MCP_API_KEY;

  beforeEach(() => {
    testDb = createTestDb();
    delete process.env.AUTH_BYPASS;
    delete process.env.MCP_API_KEY;
    resetEnv();
    resetAuthBypassUserCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalAuthBypass === undefined) {
      delete process.env.AUTH_BYPASS;
    } else {
      process.env.AUTH_BYPASS = originalAuthBypass;
    }
    if (originalMcpApiKey === undefined) {
      delete process.env.MCP_API_KEY;
    } else {
      process.env.MCP_API_KEY = originalMcpApiKey;
    }
    resetEnv();
    resetAuthBypassUserCache();
  });

  it("keeps authentication enforced by default", async () => {
    const app = createTestApp();

    const me = await app.request("/api/auth/me");
    expect(me.status).toBe(401);

    const workspaces = await app.request("/api/w");
    expect(workspaces.status).toBe(401);
  });

  it("returns a synthetic admin from /auth/me when enabled", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const res = await app.request("/api/auth/me");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      user: {
        username: "__auth_bypass_admin__",
        role: "admin",
      },
    });
  });

  it("persists the bypass user as non-admin while exposing admin request context", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const first = await app.request("/api/auth/me");
    const second = await app.request("/api/auth/me");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.user).toMatchObject({
      username: AUTH_BYPASS_USERNAME,
      role: "admin",
    });
    expect(secondBody.user.id).toBe(firstBody.user.id);

    const storedBypassUser = findUserByUsername(AUTH_BYPASS_USERNAME);
    expect(storedBypassUser).toMatchObject({ role: "user" });
  });

  it("skips setup requirements on a fresh database when enabled", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const res = await app.request("/api/setup/status");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      needsSetup: false,
      hasAdmin: false,
      hasWorkspace: false,
    });
  });

  it("allows admin writes without credentials and persists the bypass user", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const res = await app.request("/api/w", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "local", name: "Local" }),
    });

    expect(res.status).toBe(201);
    const storedBypassUser = findUserByUsername("__auth_bypass_admin__");
    expect(storedBypassUser).toMatchObject({ role: "user" });
    await expect(res.json()).resolves.toMatchObject({
      workspace: { slug: "local", created_by: storedBypassUser?.id },
    });
  });

  it("allows normal setup after disabling bypass on a fresh database", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const me = await app.request("/api/auth/me");
    expect(me.status).toBe(200);

    process.env.AUTH_BYPASS = "false";
    resetEnv();

    const status = await app.request("/api/setup/status");
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toEqual({
      needsSetup: true,
      hasAdmin: false,
      hasWorkspace: false,
    });

    const admin = await app.request("/api/setup/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });

    expect(admin.status).toBe(200);
    await expect(admin.json()).resolves.toMatchObject({
      user: { username: "admin", role: "admin" },
    });
  });

  it("rejects bypass-user API keys after bypass is disabled", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const created = await app.request("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rollback", scope: "admin" }),
    });

    expect(created.status).toBe(201);
    const { key } = await created.json();

    process.env.AUTH_BYPASS = "false";
    resetEnv();

    const workspaces = await app.request("/api/w", {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(workspaces.status).toBe(401);

    const mcpAuth = checkMcpAuth(
      new Request("http://localhost/api/mcp", {
        headers: { authorization: `Bearer ${key}` },
      })
    );
    expect(mcpAuth?.status).toBe(401);
  });

  it("does not accept share tokens as authenticated API credentials", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const adminRes = await app.request("/api/auth/me");
    const { user } = await adminRes.json() as { user: { id: string } };
    const workspace = createWorkspace("infra", "Infrastructure", "Test workspace", user.id);
    const bundle = createBundle({
      bundleId: "run-42",
      workspaceId: workspace.id,
      title: "Run 42",
      storageKey: "infra/run-42",
      sizeBytes: 1024,
      uploadedBy: user.id,
    });
    const { token } = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: user.id,
    });

    process.env.AUTH_BYPASS = "false";
    resetEnv();

    const listRes = await app.request("/api/w/infra/bundle", {
      headers: { authorization: `Bearer ${token}` },
    });
    const createShareRes = await app.request("/api/w/infra/bundles/run-42/share-tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listRes.status).toBe(401);
    expect(createShareRes.status).toBe(401);
  });

  it("allows upload-scoped middleware without credentials when enabled", async () => {
    process.env.AUTH_BYPASS = "true";
    resetEnv();
    const app = createTestApp();

    const res = await app.request("/api/upload-check", { method: "POST" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      user: {
        username: "__auth_bypass_admin__",
        role: "admin",
      },
    });
  });

  it("bypasses MCP token auth when enabled", () => {
    process.env.MCP_API_KEY = "mcp-secret";
    resetEnv();
    const request = new Request("http://localhost/api/mcp");

    expect(checkMcpAuth(request)?.status).toBe(401);

    process.env.AUTH_BYPASS = "true";
    resetEnv();

    expect(checkMcpAuth(request)).toBeNull();
  });
});
