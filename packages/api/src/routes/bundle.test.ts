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
import { createWorkspace } from "@/lib/db/workspaces";
import { createUser } from "@/lib/db/users";
import { HTML_PREVIEW_CSP_HEADER, bundleRoutes } from "./bundle";

const mockedExtractBundle = vi.mocked(extractBundle);
let tempDir: string;

function createTestApp() {
  const app = new Hono();
  app.route("/api/w", bundleRoutes);
  return app;
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
