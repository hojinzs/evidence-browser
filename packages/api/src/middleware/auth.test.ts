import type Database from "better-sqlite3";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { SESSION_COOKIE_NAME, signSessionId } from "@/lib/auth";
import { createApiKey } from "@/lib/db/api-keys";
import { createTestDb } from "@/lib/db/index";
import { createSession } from "@/lib/db/sessions";
import { createUser } from "@/lib/db/users";
import {
  authenticate,
  requireAdmin,
  requireUpload,
  type AppVariables,
} from "./auth";

let testDb: Database.Database;

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

function createTestApp() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get("/read", authenticate, (c) =>
    c.json({
      user: c.get("user"),
      apiKeyScope: c.get("apiKeyScope") ?? null,
    })
  );
  app.post("/upload", requireUpload, (c) =>
    c.json({
      user: c.get("user"),
      apiKeyScope: c.get("apiKeyScope") ?? null,
    })
  );
  app.post("/admin", requireAdmin, (c) =>
    c.json({
      user: c.get("user"),
      apiKeyScope: c.get("apiKeyScope") ?? null,
    })
  );

  return app;
}

async function seedAuthSubjects() {
  const user = await createUser("member", "password123", "user");
  const admin = await createUser("admin", "password123", "admin");
  const readKey = createApiKey(user.id, "read key", "read").key;
  const uploadKey = createApiKey(user.id, "upload key", "upload").key;
  const adminKey = createApiKey(admin.id, "admin key", "admin").key;
  const userSession = signSessionId(createSession(user.id).id);
  const adminSession = signSessionId(createSession(admin.id).id);

  return { user, admin, readKey, uploadKey, adminKey, userSession, adminSession };
}

function bearer(key: string) {
  return { authorization: `Bearer ${key}` };
}

function sessionCookie(signedSessionId: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedSessionId)}` };
}

describe("auth middleware scope enforcement", () => {
  const originalAuthBypass = process.env.AUTH_BYPASS;

  beforeEach(() => {
    testDb = createTestDb();
    process.env.AUTH_BYPASS = "false";
    resetEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalAuthBypass === undefined) {
      delete process.env.AUTH_BYPASS;
    } else {
      process.env.AUTH_BYPASS = originalAuthBypass;
    }
    resetEnv();
  });

  it("requires credentials for read access and preserves valid API key scopes", async () => {
    const { readKey, uploadKey, adminKey, userSession } = await seedAuthSubjects();
    const app = createTestApp();

    const missing = await app.request("/read");
    const invalid = await app.request("/read", { headers: bearer("eb_invalid") });
    const read = await app.request("/read", { headers: bearer(readKey) });
    const upload = await app.request("/read", { headers: bearer(uploadKey) });
    const admin = await app.request("/read", { headers: bearer(adminKey) });
    const session = await app.request("/read", { headers: sessionCookie(userSession) });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      user: { username: expect.stringMatching(/^\[api-key:eb_/) },
      apiKeyScope: "read",
    });
    expect(upload.status).toBe(200);
    await expect(upload.json()).resolves.toMatchObject({ apiKeyScope: "upload" });
    expect(admin.status).toBe(200);
    await expect(admin.json()).resolves.toMatchObject({
      user: { role: "admin" },
      apiKeyScope: "admin",
    });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      user: { username: "member", role: "user" },
      apiKeyScope: null,
    });
  });

  it("enforces upload scope for API keys and admin sessions", async () => {
    const { readKey, uploadKey, adminKey, userSession, adminSession } =
      await seedAuthSubjects();
    const app = createTestApp();

    const missing = await app.request("/upload", { method: "POST" });
    const invalid = await app.request("/upload", {
      method: "POST",
      headers: bearer("eb_invalid"),
    });
    const read = await app.request("/upload", {
      method: "POST",
      headers: bearer(readKey),
    });
    const user = await app.request("/upload", {
      method: "POST",
      headers: sessionCookie(userSession),
    });
    const upload = await app.request("/upload", {
      method: "POST",
      headers: bearer(uploadKey),
    });
    const adminKeyRes = await app.request("/upload", {
      method: "POST",
      headers: bearer(adminKey),
    });
    const adminSessionRes = await app.request("/upload", {
      method: "POST",
      headers: sessionCookie(adminSession),
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(read.status).toBe(403);
    expect(user.status).toBe(403);
    expect(upload.status).toBe(200);
    await expect(upload.json()).resolves.toMatchObject({ apiKeyScope: "upload" });
    expect(adminKeyRes.status).toBe(200);
    await expect(adminKeyRes.json()).resolves.toMatchObject({ apiKeyScope: "admin" });
    expect(adminSessionRes.status).toBe(200);
    await expect(adminSessionRes.json()).resolves.toMatchObject({
      user: { username: "admin", role: "admin" },
      apiKeyScope: null,
    });
  });

  it("enforces admin scope for API keys and session users", async () => {
    const { readKey, uploadKey, adminKey, userSession, adminSession } =
      await seedAuthSubjects();
    const app = createTestApp();

    const missing = await app.request("/admin", { method: "POST" });
    const invalid = await app.request("/admin", {
      method: "POST",
      headers: bearer("eb_invalid"),
    });
    const read = await app.request("/admin", {
      method: "POST",
      headers: bearer(readKey),
    });
    const upload = await app.request("/admin", {
      method: "POST",
      headers: bearer(uploadKey),
    });
    const user = await app.request("/admin", {
      method: "POST",
      headers: sessionCookie(userSession),
    });
    const adminKeyRes = await app.request("/admin", {
      method: "POST",
      headers: bearer(adminKey),
    });
    const adminSessionRes = await app.request("/admin", {
      method: "POST",
      headers: sessionCookie(adminSession),
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(read.status).toBe(403);
    expect(upload.status).toBe(403);
    expect(user.status).toBe(403);
    expect(adminKeyRes.status).toBe(200);
    await expect(adminKeyRes.json()).resolves.toMatchObject({ apiKeyScope: "admin" });
    expect(adminSessionRes.status).toBe(200);
    await expect(adminSessionRes.json()).resolves.toMatchObject({
      user: { username: "admin", role: "admin" },
      apiKeyScope: null,
    });
  });
});
