import fs from "fs";
import os from "os";
import path from "path";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { createTestDb } from "@/lib/db/index";

const { mockPutBundle, mockValidateBundleZip, originalValidateBundleZip } = vi.hoisted(() => ({
  mockPutBundle: vi.fn(),
  mockValidateBundleZip: vi.fn(),
  originalValidateBundleZip: {
    current: undefined as undefined | typeof import("@/lib/bundle/extractor").validateBundleZip,
  },
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
  originalValidateBundleZip.current = original.validateBundleZip;
  mockValidateBundleZip.mockImplementation(original.validateBundleZip);
  return {
    ...original,
    extractBundle: vi.fn(),
    validateBundleZip: mockValidateBundleZip,
  };
});

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: () => ({
    putBundle: mockPutBundle,
  }),
}));

import { extractBundle, validateBundleZip } from "@/lib/bundle/extractor";
import { createBundle, findBundle } from "@/lib/db/bundles";
import {
  createBundleShareToken,
  revokeBundleShareToken,
} from "@/lib/db/share-tokens";
import { createWorkspace } from "@/lib/db/workspaces";
import { createUser } from "@/lib/db/users";
import { HTML_PREVIEW_CSP_HEADER, bundleRoutes, shareBundleRoutes } from "./bundle";

const mockedExtractBundle = vi.mocked(extractBundle);
const mockedValidateBundleZip = vi.mocked(validateBundleZip);
let tempDir: string;
const originalMaxBundleSize = process.env.MAX_BUNDLE_SIZE;

function restoreMaxBundleSize() {
  if (originalMaxBundleSize === undefined) {
    delete process.env.MAX_BUNDLE_SIZE;
  } else {
    process.env.MAX_BUNDLE_SIZE = originalMaxBundleSize;
  }
}

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

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [filename, content] of Object.entries(files)) {
    const name = Buffer.from(filename);
    const data = Buffer.from(content);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.byteLength, 18);
    local.writeUInt32LE(data.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.byteLength, 20);
    central.writeUInt32LE(data.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.byteLength + name.byteLength + data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function makeValidBundleZip(title = "Uploaded Bundle"): Buffer {
  return makeZip({
    "manifest.json": JSON.stringify({ version: 1, title, index: "index.md" }),
    "index.md": "# Uploaded Bundle\n",
  });
}

async function seedUploadWorkspace(username = "admin-upload") {
  const admin = await createUser(username, "password123", "admin");
  authState.uploadUserId = admin.id;
  const workspace = createWorkspace("default", "Default", "Upload workspace", admin.id);
  return { admin, workspace };
}

function formDataForUpload(file: Buffer, filename: string, bundleId?: string) {
  const formData = new FormData();
  if (bundleId !== undefined) formData.set("bundleId", bundleId);
  formData.set("file", new File([new Uint8Array(file)], filename, { type: "application/zip" }));
  return formData;
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

  it("serves public file content for an active share token", async () => {
    fs.mkdirSync(path.join(tempDir, "logs"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "logs", "app.txt"), "shared log output");
    const { admin, bundle } = await seedBundle({});
    const { token } = createBundleShareToken({
      bundleInternalId: bundle.id,
      createdBy: admin.id,
    });
    const app = createTestApp();

    const res = await app.request(`/api/s/${token}/file?path=logs%2Fapp.txt`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(res.text()).resolves.toBe("shared log output");
    expect(mockedExtractBundle).toHaveBeenCalledWith("infra/pr-42-run-1");
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

describe("bundle upload route", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    restoreMaxBundleSize();
    resetEnv();
    mockedValidateBundleZip.mockImplementation(originalValidateBundleZip.current!);
  });

  afterEach(() => {
    restoreMaxBundleSize();
    resetEnv();
    vi.clearAllMocks();
  });

  it("accepts a valid multipart bundle ZIP and stores metadata", async () => {
    const { admin, workspace } = await seedUploadWorkspace("admin-upload-valid");
    const zip = makeValidBundleZip("Valid Upload Fixture");
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle", {
      method: "POST",
      body: formDataForUpload(zip, "valid-upload.zip", "valid-upload"),
    });

    expect(res.status).toBe(201);
    const payload = await res.json() as {
      bundle: {
        bundle_id: string;
        title: string;
        storage_key: string;
        size_bytes: number;
        uploaded_by: string;
      };
    };
    expect(payload.bundle).toMatchObject({
      bundle_id: "valid-upload",
      title: "Valid Upload Fixture",
      storage_key: "default/valid-upload",
      size_bytes: zip.byteLength,
      uploaded_by: admin.id,
    });
    expect(findBundle(workspace.id, "valid-upload")).toMatchObject({
      bundle_id: "valid-upload",
      storage_key: "default/valid-upload",
      title: "Valid Upload Fixture",
      size_bytes: zip.byteLength,
    });
    expect(mockedValidateBundleZip).toHaveBeenCalledTimes(1);
    expect(mockedValidateBundleZip).toHaveBeenCalledWith(expect.stringMatching(/upload\.zip$/));
    expect(mockPutBundle).toHaveBeenCalledTimes(1);
    expect(mockPutBundle).toHaveBeenCalledWith("default/valid-upload", zip);
  });

  it("rejects an empty bundleId before deriving from a valid filename", async () => {
    await seedUploadWorkspace("admin-upload-empty-id");
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle", {
      method: "POST",
      body: formDataForUpload(makeValidBundleZip(), "valid-upload.zip", ""),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid bundleId" });
    expect(mockedValidateBundleZip).not.toHaveBeenCalled();
    expect(mockPutBundle).not.toHaveBeenCalled();
  });

  it("rejects a malicious bundleId before validation or storage", async () => {
    await seedUploadWorkspace("admin-upload-malicious-id");
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle", {
      method: "POST",
      body: formDataForUpload(makeValidBundleZip(), "valid-upload.zip", "../bad"),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid bundleId" });
    expect(mockedValidateBundleZip).not.toHaveBeenCalled();
    expect(mockPutBundle).not.toHaveBeenCalled();
  });

  it("returns 400 and skips storage when ZIP validation fails", async () => {
    const { workspace } = await seedUploadWorkspace("admin-upload-invalid-zip");
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle", {
      method: "POST",
      body: formDataForUpload(
        makeZip({ "index.md": "# Missing manifest\n" }),
        "invalid-upload.zip",
        "invalid-upload"
      ),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "manifest.json was not found" });
    expect(mockedValidateBundleZip).toHaveBeenCalledTimes(1);
    expect(mockPutBundle).not.toHaveBeenCalled();
    expect(findBundle(workspace.id, "invalid-upload")).toBeUndefined();
  });

  it("returns 413 for bundles over MAX_BUNDLE_SIZE before validation or storage", async () => {
    await seedUploadWorkspace("admin-upload-too-large");
    const zip = makeValidBundleZip();
    process.env.MAX_BUNDLE_SIZE = String(zip.byteLength - 1);
    resetEnv();
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle", {
      method: "POST",
      body: formDataForUpload(zip, "too-large.zip", "too-large"),
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: `File too large (max ${zip.byteLength - 1} bytes)`,
    });
    expect(mockedValidateBundleZip).not.toHaveBeenCalled();
    expect(mockPutBundle).not.toHaveBeenCalled();
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
    mockedValidateBundleZip.mockImplementation(originalValidateBundleZip.current!);
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

  it("returns an English fallback when demo bundle validation throws a non-Error", async () => {
    const admin = await createUser("admin", "password123", "admin");
    authState.uploadUserId = admin.id;
    createWorkspace("default", "Default", "Demo workspace", admin.id);
    mockedValidateBundleZip.mockRejectedValue("invalid demo bundle");
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle/demo", { method: "POST" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Bundle validation failed" });
    expect(mockPutBundle).not.toHaveBeenCalled();
  });

  it("returns an English fallback when uploaded bundle validation throws a non-Error", async () => {
    const admin = await createUser("admin", "password123", "admin");
    authState.uploadUserId = admin.id;
    createWorkspace("default", "Default", "Demo workspace", admin.id);
    mockedValidateBundleZip.mockRejectedValue("invalid uploaded bundle");
    const formData = new FormData();
    formData.set("bundleId", "bad-bundle");
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "bad-bundle.zip", { type: "application/zip" }));
    const app = createTestApp();

    const res = await app.request("/api/w/default/bundle", { method: "POST", body: formData });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Bundle validation failed" });
    expect(mockPutBundle).not.toHaveBeenCalled();
  });
});
