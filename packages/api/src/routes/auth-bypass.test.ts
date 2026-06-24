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
import { findUserByUsername } from "@/lib/db/users";
import { requireUpload, type AppVariables } from "@/middleware/auth";
import { authRoutes } from "./auth";
import { checkAuth as checkMcpAuth } from "./mcp";
import { setupRoutes } from "./setup";
import { workspaceRoutes } from "./workspace";

function createTestApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/api/auth", authRoutes);
  app.route("/api/setup", setupRoutes);
  app.route("/api/w", workspaceRoutes);
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
    expect(storedBypassUser).toMatchObject({ role: "admin" });
    await expect(res.json()).resolves.toMatchObject({
      workspace: { slug: "local", created_by: storedBypassUser?.id },
    });
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
