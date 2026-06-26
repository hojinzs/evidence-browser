import fs from "fs";
import os from "os";
import path from "path";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/index";

const { mockPutBundle } = vi.hoisted(() => ({
  mockPutBundle: vi.fn(),
}));
const authState = vi.hoisted(() => ({
  uploadUserId: "user-1",
}));

let testDb: Database.Database;

vi.mock("@/middleware/auth", () => ({
  authenticate: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "user-1", username: "tester", role: "user" });
    await next();
  },
  requireUpload: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: authState.uploadUserId, username: "tester", role: "admin" });
    await next();
  },
}));

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

vi.mock("@/lib/bundle/extractor", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bundle/extractor")>();
  return {
    ...original,
    extractBundle: vi.fn(),
  };
});

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: () => ({
    putBundle: mockPutBundle,
  }),
}));

import { extractBundle } from "@/lib/bundle/extractor";
import { createBundle } from "@/lib/db/bundles";
import {
  createBundleShareToken,
  revokeBundleShareToken,
} from "@/lib/db/share-tokens";
import { createWorkspace } from "@/lib/db/workspaces";
import { createUser } from "@/lib/db/users";
import { HTML_PREVIEW_CSP_HEADER, bundleRoutes, shareBundleRoutes } from "./bundle";

const mockedExtractBundle = vi.mocked(extractBundle);
let tempDir: string;

function createTestApp() {
  const app = new Hono();
  app.route("/api/w", bundleRoutes);
  app.route("/api/s", shareBundleRoutes);
  return app;
}

async function seedBundle(data: {
  workspaceSlug?: string;
  bundleId?: string;
  storageKey?: string;
}) {
  const admin = await createUser(`admin-${data.bundleId ?? "bundle"}`, "password123", "admin");
  const workspace = createWorkspace(
    data.workspaceSlug ?? "infra",
    "Infrastructure",
    "Test workspace",
    admin.id
  );
  const bundle = createBundle({
    bundleId: data.bundleId ?? "pr-42-run-1",
    workspaceId: workspace.id,
    title: "Bundle fixture",
    storageKey: data.storageKey ?? `${workspace.slug}/${data.bundleId ?? "pr-42-run-1"}`,
    sizeBytes: 1024,
    uploadedBy: admin.id,
  });

  return { admin, workspace, bundle };
}

describe("bundle preview route", () => {
  beforeEach(() => {
    testDb = createTestDb();
    authState.uploadUserId = "user-1";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-preview-test-"));
    mockedExtractBundle.mockResolvedValue({
      cacheDir: tempDir,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      manifest: { version: 1, title: "Preview fixture", index: "reports/index.html" },
      fileTree: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("serves HTML preview content with restrictive headers", async () => {
    const maliciousHtml = `<!doctype html>
<button onclick="window.evidencePwned = true">Run</button>
<script>window.evidencePwned = true</script>
<iframe src="https://evil.example/frame.html"></iframe>
<img src="https://evil.example/pixel.png">
<script src="https://evil.example/payload.js"></script>`;
    fs.mkdirSync(path.join(tempDir, "reports"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "reports", "index.html"), maliciousHtml);

    const app = createTestApp();
    const res = await app.request("/api/w/infra/bundles/pr-42-run-1/preview?path=reports%2Findex.html");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Content-Security-Policy")).toBe(HTML_PREVIEW_CSP_HEADER);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(HTML_PREVIEW_CSP_HEADER).toContain("script-src 'none'");
    expect(HTML_PREVIEW_CSP_HEADER).toContain("connect-src 'none'");
    expect(HTML_PREVIEW_CSP_HEADER).toContain("frame-src 'none'");
    expect(HTML_PREVIEW_CSP_HEADER).toContain("img-src 'self' data:");
    expect(HTML_PREVIEW_CSP_HEADER).not.toContain("https:");
    await expect(res.text()).resolves.toBe(maliciousHtml);
  });

  it("rejects path traversal before bundle extraction", async () => {
    const app = createTestApp();
    const res = await app.request("/api/w/infra/bundles/pr-42-run-1/preview?path=..%2Fsecret.html");

    expect(res.status).toBe(400);
    expect(mockedExtractBundle).not.toHaveBeenCalled();
  });

  it("rejects non-HTML preview paths", async () => {
    const app = createTestApp();
    const res = await app.request("/api/w/infra/bundles/pr-42-run-1/preview?path=logs%2Fapp.txt");

    expect(res.status).toBe(415);
    expect(mockedExtractBundle).not.toHaveBeenCalled();
  });
});

describe("public share bundle routes", () => {
  beforeEach(() => {
    testDb = createTestDb();
    authState.uploadUserId = "user-1";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-share-test-"));
    mockedExtractBundle.mockResolvedValue({
      cacheDir: tempDir,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      manifest: { version: 1, title: "Shared fixture", index: "index.md" },
      fileTree: [{ name: "index.md", path: "index.md", type: "file" }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("serves bundle metadata without authentication for an active share token", async () => {
    const { admin, bundle } = await seedBundle({});
    const { token } = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request(`/api/s/${token}/meta`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      manifest: { version: 1, title: "Shared fixture", index: "index.md" },
      tree: [{ name: "index.md", path: "index.md", type: "file" }],
    });
    expect(mockedExtractBundle).toHaveBeenCalledWith("infra/pr-42-run-1");
  });

  it("returns not found for invalid, revoked, and expired share tokens", async () => {
    const { admin, bundle } = await seedBundle({});
    const revoked = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
    });
    revokeBundleShareToken({
      tokenId: revoked.record.id,
      bundleInternalId: bundle.id,
      userId: admin.id,
      isAdmin: true,
    });
    const expired = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
    const app = createTestApp();

    const invalidRes = await app.request("/api/s/not-a-token/meta");
    const revokedRes = await app.request(`/api/s/${revoked.token}/meta`);
    const expiredRes = await app.request(`/api/s/${expired.token}/meta`);

    expect(invalidRes.status).toBe(404);
    expect(revokedRes.status).toBe(404);
    expect(expiredRes.status).toBe(404);
    expect(mockedExtractBundle).not.toHaveBeenCalled();
  });

  it("scopes public reads exclusively to the token bundle", async () => {
    const { admin, bundle } = await seedBundle({
      workspaceSlug: "infra",
      bundleId: "bundle-a",
      storageKey: "infra/bundle-a",
    });
    await seedBundle({
      workspaceSlug: "ops",
      bundleId: "bundle-b",
      storageKey: "ops/bundle-b",
    });
    const { token } = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request(`/api/s/${token}/tree`);

    expect(res.status).toBe(200);
    expect(mockedExtractBundle).toHaveBeenCalledWith("infra/bundle-a");
    expect(mockedExtractBundle).not.toHaveBeenCalledWith("ops/bundle-b");
  });

  it("rejects traversal in public file routes before extraction", async () => {
    const { admin, bundle } = await seedBundle({});
    const { token } = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request(`/api/s/${token}/file?path=..%2Fsecret.txt`);

    expect(res.status).toBe(400);
    expect(mockedExtractBundle).not.toHaveBeenCalled();
  });

  it("serves public HTML previews with the same restrictive headers", async () => {
    fs.writeFileSync(path.join(tempDir, "report.html"), "<h1>Report</h1>");
    const { admin, bundle } = await seedBundle({});
    const { token } = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request(`/api/s/${token}/preview?path=report.html`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(HTML_PREVIEW_CSP_HEADER);
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    await expect(res.text()).resolves.toBe("<h1>Report</h1>");
  });

  it("does not expose write routes under the share API", async () => {
    const { admin, bundle } = await seedBundle({});
    const { token } = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request(`/api/s/${token}/meta`, { method: "POST" });

    expect(res.status).toBe(404);
  });
});

describe("bundle share token management routes", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("creates revocable share tokens without storing the raw token", async () => {
    const admin = await createUser("admin-share-manager", "password123", "admin");
    authState.uploadUserId = admin.id;
    const workspace = createWorkspace("infra", "Infrastructure", "Test workspace", admin.id);
    createBundle({
      bundleId: "pr-42-run-1",
      workspaceId: workspace.id,
      title: "Bundle fixture",
      storageKey: "infra/pr-42-run-1",
      sizeBytes: 1024,
      uploadedBy: admin.id,
    });
    const app = createTestApp();

    const createRes = await app.request("/api/w/infra/bundles/pr-42-run-1/share-tokens", {
      method: "POST",
      body: JSON.stringify({ expiresAt: "2999-01-01T00:00:00.000Z" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(createRes.status).toBe(201);
    const payload = await createRes.json() as {
      token: string;
      shareToken: { id: string; token_prefix: string; expires_at: string };
    };
    expect(payload.token).toMatch(/^ebs_/);
    expect(payload.shareToken.token_prefix).toBe(payload.token.slice(0, 12));
    expect(payload.shareToken.expires_at).toBe("2999-01-01T00:00:00.000Z");
    const stored = testDb
      .prepare("SELECT token_hash FROM bundle_share_tokens WHERE id = ?")
      .get(payload.shareToken.id) as { token_hash: string };
    expect(stored.token_hash).not.toBe(payload.token);

    const deleteRes = await app.request(
      `/api/w/infra/bundles/pr-42-run-1/share-tokens/${payload.shareToken.id}`,
      { method: "DELETE" }
    );
    expect(deleteRes.status).toBe(204);
    const publicRes = await app.request(`/api/s/${payload.token}/meta`);
    expect(publicRes.status).toBe(404);
  });

  it("rejects invalid share token expiry input", async () => {
    const admin = await createUser("admin-share-expiry", "password123", "admin");
    authState.uploadUserId = admin.id;
    const workspace = createWorkspace("infra", "Infrastructure", "Test workspace", admin.id);
    createBundle({
      bundleId: "pr-42-run-1",
      workspaceId: workspace.id,
      title: "Bundle fixture",
      storageKey: "infra/pr-42-run-1",
      sizeBytes: 1024,
      uploadedBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request("/api/w/infra/bundles/pr-42-run-1/share-tokens", {
      method: "POST",
      body: JSON.stringify({ expiresAt: "not-a-date" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
  });

  it("normalizes accepted share token expiry input before storage", async () => {
    const admin = await createUser("admin-share-expiry-normalized", "password123", "admin");
    authState.uploadUserId = admin.id;
    const workspace = createWorkspace("infra", "Infrastructure", "Test workspace", admin.id);
    createBundle({
      bundleId: "pr-42-run-1",
      workspaceId: workspace.id,
      title: "Bundle fixture",
      storageKey: "infra/pr-42-run-1",
      sizeBytes: 1024,
      uploadedBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request("/api/w/infra/bundles/pr-42-run-1/share-tokens", {
      method: "POST",
      body: JSON.stringify({ expiresAt: "Fri, 01 Jan 2100 00:00:00 GMT" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    const payload = await res.json() as {
      token: string;
      shareToken: { expires_at: string | null };
    };
    expect(payload.shareToken.expires_at).toBe("2100-01-01T00:00:00.000Z");

    const publicRes = await app.request(`/api/s/${payload.token}/meta`);
    expect(publicRes.status).toBe(200);
  });
});

describe("demo bundle route", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("loads the shipped sample bundle into a workspace", async () => {
    const admin = await createUser("admin", "password123", "admin");
    authState.uploadUserId = admin.id;
    createWorkspace("default", "Default", "Demo workspace", admin.id);
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle/demo", { method: "POST" });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as { bundle: { bundle_id: string; title: string; storage_key: string } };
    expect(payload.bundle.bundle_id).toBe("sample");
    expect(payload.bundle.title).toBe("Evidence Browser Demo Bundle");
    expect(payload.bundle.storage_key).toBe("default/sample");
    expect(mockPutBundle).toHaveBeenCalledTimes(1);
    expect(mockPutBundle).toHaveBeenCalledWith("default/sample", expect.any(Buffer));
  });

  it("returns the existing sample bundle on repeat loads", async () => {
    const admin = await createUser("admin", "password123", "admin");
    authState.uploadUserId = admin.id;
    createWorkspace("default", "Default", "Demo workspace", admin.id);
    const app = createTestApp();

    const first = await app.request("/api/w/default/bundle/demo", { method: "POST" });
    const second = await app.request("/api/w/default/bundle/demo", { method: "POST" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const payload = (await second.json()) as { bundle: { bundle_id: string; title: string } };
    expect(payload.bundle.bundle_id).toBe("sample");
    expect(payload.bundle.title).toBe("Evidence Browser Demo Bundle");
    expect(mockPutBundle).toHaveBeenCalledTimes(1);
  });
});
