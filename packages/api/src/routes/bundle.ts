import fs from "fs";
import os from "os";
import path from "path";
import { Hono, type Context } from "hono";
import { authenticate, requireUpload, type AppVariables } from "@/middleware/auth";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { findBundle, listBundles, createBundle, deleteBundle } from "@/lib/db/bundles";
import {
  createBundleShareToken,
  findActiveBundleShareToken,
  listBundleShareTokens,
  revokeBundleShareToken,
} from "@/lib/db/share-tokens";
import { getStorageAdapter } from "@/lib/storage";
import { storageKey } from "@/lib/url";
import { validateBundleZip, extractBundle, getFileContent } from "@/lib/bundle/extractor";
import {
  validateUploadedFile,
  validateBundleSize,
  deriveAndValidateBundleId,
} from "@/lib/bundle/upload-validation";
import { getEnv } from "@/config/env";
import {
  BundleNotFoundError,
  BundleSizeLimitError,
  FileCountLimitError,
  ManifestNotFoundError,
  ManifestValidationError,
  IndexFileNotFoundError,
} from "@/lib/bundle/types";
import { ensureWithinRoot, validatePathSafety } from "@/lib/bundle/security";
import { getMimeType } from "@/lib/files/detect";

const CSP_HEADER = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
export const HTML_PREVIEW_CSP_HEADER = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "style-src 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
const bundle = new Hono<{ Variables: AppVariables }>();
const shareBundle = new Hono();
const DEMO_BUNDLE_ID = "sample";
const SHARE_TOKEN_PATTERN = /^ebs_[A-Za-z0-9_-]{43}$/;

function findSampleBundlePath(): string | null {
  const candidates = [
    // Root workspace or Docker runtime (`/app/examples/sample.zip`).
    path.resolve(process.cwd(), "examples/sample.zip"),
    // Package-local execution from compiled or source API routes.
    path.resolve(__dirname, "../../../../examples/sample.zip"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

bundle.get("/:ws/bundle", authenticate, (c) => {
  const ws = c.req.param("ws");
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);
  return c.json({ bundles: listBundles(workspace.id) });
});

function handleBundleError(c: Context, err: unknown, label: string) {
  if (err instanceof BundleNotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof BundleSizeLimitError || err instanceof FileCountLimitError) {
    return c.json({ error: err.message }, 413);
  }
  if (err instanceof ManifestNotFoundError || err instanceof ManifestValidationError || err instanceof IndexFileNotFoundError) {
    return c.json({ error: err.message }, 400);
  }
  console.error(`Bundle ${label} error:`, err);
  return c.json({ error: "Internal server error" }, 500);
}

async function bundleMetaResponse(c: Context, key: string) {
  try {
    const entry = await extractBundle(key);
    return c.json({ manifest: entry.manifest, tree: entry.fileTree });
  } catch (err) {
    return handleBundleError(c, err, "meta");
  }
}

async function bundleTreeResponse(c: Context, key: string) {
  try {
    const entry = await extractBundle(key);
    return c.json({ tree: entry.fileTree });
  } catch (err) {
    if (err instanceof BundleNotFoundError) return c.json({ error: err.message }, 404);
    console.error("Bundle tree error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}

async function bundleFileResponse(c: Context, key: string) {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "Missing 'path' query parameter" }, 400);
  if (!validatePathSafety(filePath)) return c.json({ error: "Invalid file path" }, 400);

  try {
    const entry = await extractBundle(key);
    const fullPath = path.join(entry.cacheDir, filePath);
    if (!ensureWithinRoot(entry.cacheDir, fullPath)) {
      return c.json({ error: "Invalid file path" }, 403);
    }

    const content = await getFileContent(entry.cacheDir, filePath);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": getMimeType(filePath),
        "Content-Security-Policy": CSP_HEADER,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof BundleNotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof Error && (err.message === "Invalid file path" || err.message.includes("ENOENT"))) {
      return c.json({ error: "File not found" }, 404);
    }
    console.error("Bundle file error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}

async function bundlePreviewResponse(c: Context, key: string) {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "Missing 'path' query parameter" }, 400);
  if (!validatePathSafety(filePath)) return c.json({ error: "Invalid file path" }, 400);
  if (!filePath.toLowerCase().endsWith(".html")) {
    return c.json({ error: "Preview is only available for HTML files" }, 415);
  }

  try {
    const entry = await extractBundle(key);
    const fullPath = path.join(entry.cacheDir, filePath);
    if (!ensureWithinRoot(entry.cacheDir, fullPath)) {
      return c.json({ error: "Invalid file path" }, 403);
    }

    const content = await getFileContent(entry.cacheDir, filePath);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": HTML_PREVIEW_CSP_HEADER,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    if (err instanceof BundleNotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof Error && (err.message === "Invalid file path" || err.message.includes("ENOENT"))) {
      return c.json({ error: "File not found" }, 404);
    }
    console.error("Bundle preview error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}

function resolveShareStorageKey(c: Context): string | Response {
  const token = c.req.param("token");
  if (!token) return c.json({ error: "Share link not found" }, 404);
  if (!SHARE_TOKEN_PATTERN.test(token)) return c.json({ error: "Share link not found" }, 404);
  const shareToken = findActiveBundleShareToken(token);
  if (!shareToken) return c.json({ error: "Share link not found" }, 404);
  return shareToken.bundle.storage_key;
}

async function deleteBundleRoute(c: Context<{ Variables: AppVariables }>) {
  const ws = c.req.param("ws");
  const bundleId = c.req.param("bundleId");
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  if (!bundleId) return c.json({ error: "Bundle not found" }, 404);
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);

  const existing = findBundle(workspace.id, bundleId);
  if (!existing) return c.json({ error: "Bundle not found" }, 404);

  const storage = getStorageAdapter();
  if (!storage.deleteBundle) {
    return c.json({ error: "Storage adapter does not support delete" }, 501);
  }

  const deleted = deleteBundle(existing.id);
  if (!deleted) {
    return c.json({ error: "Bundle not found" }, 404);
  }

  await storage.deleteBundle(existing.storage_key);

  return c.body(null, 204);
}

bundle.delete("/:ws/bundle/:bundleId", requireUpload, deleteBundleRoute);
bundle.delete("/:ws/bundles/:bundleId", requireUpload, deleteBundleRoute);

bundle.post("/:ws/bundle/demo", requireUpload, async (c) => {
  const user = c.get("user");
  const ws = c.req.param("ws");
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);

  const existing = findBundle(workspace.id, DEMO_BUNDLE_ID);
  if (existing) return c.json({ bundle: existing }, 200);

  const samplePath = findSampleBundlePath();
  if (!samplePath) return c.json({ error: "Sample bundle not found" }, 500);

  const buffer = await fs.promises.readFile(samplePath);
  const env = getEnv();
  const sizeResult = validateBundleSize(buffer.byteLength, env.MAX_BUNDLE_SIZE);
  if (!sizeResult.ok) return c.json({ error: sizeResult.error.message }, sizeResult.error.status);

  let title: string | null = null;
  try {
    title = (await validateBundleZip(samplePath)).title;
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Bundle validation failed" }, 400);
  }

  const storage = getStorageAdapter();
  if (!storage.putBundle) {
    return c.json({ error: "Storage adapter does not support upload" }, 501);
  }

  const key = storageKey(ws, DEMO_BUNDLE_ID);
  await storage.putBundle(key, buffer);

  try {
    const created = createBundle({
      bundleId: DEMO_BUNDLE_ID,
      workspaceId: workspace.id,
      title,
      storageKey: key,
      sizeBytes: buffer.byteLength,
      uploadedBy: user.id,
    });

    return c.json({ bundle: created }, 201);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const racedBundle = findBundle(workspace.id, DEMO_BUNDLE_ID);
    if (racedBundle) return c.json({ bundle: racedBundle }, 200);
    throw error;
  }
});

bundle.post("/:ws/bundle", requireUpload, async (c) => {
  const user = c.get("user");
  const ws = c.req.param("ws");
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);

  const formData = await c.req.raw.formData().catch(() => null);
  if (!formData) return c.json({ error: "Invalid form data" }, 400);

  const rawFile = formData.get("file") as File | null;
  const fileResult = validateUploadedFile(rawFile);
  if (!fileResult.ok) return c.json({ error: fileResult.error.message }, fileResult.error.status);
  const file = fileResult.value;

  const env = getEnv();
  const sizeResult = validateBundleSize(file.size, env.MAX_BUNDLE_SIZE);
  if (!sizeResult.ok) return c.json({ error: sizeResult.error.message }, sizeResult.error.status);

  const bundleIdResult = deriveAndValidateBundleId(formData.get("bundleId") as string | null, file.name);
  if (!bundleIdResult.ok) {
    return c.json({ error: bundleIdResult.error.message }, bundleIdResult.error.status);
  }
  const bundleId = bundleIdResult.value;

  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpDir = path.join(os.tmpdir(), `evidence-upload-${Date.now()}`);
  const tmpZip = path.join(tmpDir, "upload.zip");
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    fs.writeFileSync(tmpZip, buffer);
    const key = storageKey(ws, bundleId);

    let title: string | null = null;
    try {
      title = (await validateBundleZip(tmpZip)).title;
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Bundle validation failed" }, 400);
    }

    const storage = getStorageAdapter();
    if (!storage.putBundle) {
      return c.json({ error: "Storage adapter does not support upload" }, 501);
    }
    await storage.putBundle(key, buffer);

    const created = createBundle({
      bundleId,
      workspaceId: workspace.id,
      title,
      storageKey: key,
      sizeBytes: file.size,
      uploadedBy: user.id,
    });

    return c.json({ bundle: created }, 201);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

bundle.get("/:ws/bundles/:bundleId/meta", authenticate, async (c) => {
  const key = storageKey(c.req.param("ws"), c.req.param("bundleId"));
  return bundleMetaResponse(c, key);
});

bundle.get("/:ws/bundles/:bundleId/tree", authenticate, async (c) => {
  const key = storageKey(c.req.param("ws"), c.req.param("bundleId"));
  return bundleTreeResponse(c, key);
});

bundle.get("/:ws/bundles/:bundleId/file", authenticate, async (c) => {
  const key = storageKey(c.req.param("ws"), c.req.param("bundleId"));
  return bundleFileResponse(c, key);
});

bundle.get("/:ws/bundles/:bundleId/preview", authenticate, async (c) => {
  const key = storageKey(c.req.param("ws"), c.req.param("bundleId"));
  return bundlePreviewResponse(c, key);
});

bundle.get("/:ws/bundles/:bundleId/share-tokens", requireUpload, (c) => {
  const workspace = findWorkspaceBySlug(c.req.param("ws"));
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);
  const existing = findBundle(workspace.id, c.req.param("bundleId"));
  if (!existing) return c.json({ error: "Bundle not found" }, 404);

  return c.json({ shareTokens: listBundleShareTokens(existing.id) });
});

bundle.post("/:ws/bundles/:bundleId/share-tokens", requireUpload, async (c) => {
  const user = c.get("user");
  const workspace = findWorkspaceBySlug(c.req.param("ws"));
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);
  const existing = findBundle(workspace.id, c.req.param("bundleId"));
  if (!existing) return c.json({ error: "Bundle not found" }, 404);

  const body = await c.req.json().catch(() => ({})) as { expiresAt?: unknown };
  let expiresAt: string | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    if (typeof body.expiresAt !== "string") {
      return c.json({ error: "Invalid expiresAt" }, 400);
    }
    const expiresMs = Date.parse(body.expiresAt);
    if (Number.isNaN(expiresMs)) {
      return c.json({ error: "Invalid expiresAt" }, 400);
    }
    expiresAt = new Date(expiresMs).toISOString();
  }

  const created = createBundleShareToken({
    bundleInternalId: existing.id,
    createdBy: user.id,
    expiresAt,
  });

  return c.json({ token: created.token, shareToken: created.record }, 201);
});

bundle.delete("/:ws/bundles/:bundleId/share-tokens/:tokenId", requireUpload, (c) => {
  const user = c.get("user");
  const workspace = findWorkspaceBySlug(c.req.param("ws"));
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);
  const existing = findBundle(workspace.id, c.req.param("bundleId"));
  if (!existing) return c.json({ error: "Bundle not found" }, 404);

  const revoked = revokeBundleShareToken({
    tokenId: c.req.param("tokenId"),
    bundleInternalId: existing.id,
    userId: user.id,
    isAdmin: user.role === "admin" || c.get("apiKeyScope") === "admin",
  });
  if (!revoked) return c.json({ error: "Share token not found" }, 404);
  return c.body(null, 204);
});

shareBundle.get("/:token/meta", async (c) => {
  const key = resolveShareStorageKey(c);
  if (typeof key !== "string") return key;
  return bundleMetaResponse(c, key);
});

shareBundle.get("/:token/tree", async (c) => {
  const key = resolveShareStorageKey(c);
  if (typeof key !== "string") return key;
  return bundleTreeResponse(c, key);
});

shareBundle.get("/:token/file", async (c) => {
  const key = resolveShareStorageKey(c);
  if (typeof key !== "string") return key;
  return bundleFileResponse(c, key);
});

shareBundle.get("/:token/preview", async (c) => {
  const key = resolveShareStorageKey(c);
  if (typeof key !== "string") return key;
  return bundlePreviewResponse(c, key);
});

export const bundleRoutes = bundle;
export const shareBundleRoutes = shareBundle;
