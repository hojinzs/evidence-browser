import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { authenticate, requireUpload, type AppVariables } from "@/middleware/auth";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { listBundles, createBundle } from "@/lib/db/bundles";
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
const bundle = new Hono<{ Variables: AppVariables }>();

bundle.get("/:ws/bundle", authenticate, (c) => {
  const ws = c.req.param("ws");
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);
  return c.json({ bundles: listBundles(workspace.id) });
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
      return c.json({ error: error instanceof Error ? error.message : "번들 검증 실패" }, 400);
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
  try {
    const entry = await extractBundle(key);
    return c.json({ manifest: entry.manifest, tree: entry.fileTree });
  } catch (err) {
    if (err instanceof BundleNotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof BundleSizeLimitError || err instanceof FileCountLimitError) {
      return c.json({ error: err.message }, 413);
    }
    if (err instanceof ManifestNotFoundError || err instanceof ManifestValidationError || err instanceof IndexFileNotFoundError) {
      return c.json({ error: err.message }, 400);
    }
    console.error("Bundle meta error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

bundle.get("/:ws/bundles/:bundleId/tree", authenticate, async (c) => {
  const key = storageKey(c.req.param("ws"), c.req.param("bundleId"));
  try {
    const entry = await extractBundle(key);
    return c.json({ tree: entry.fileTree });
  } catch (err) {
    if (err instanceof BundleNotFoundError) return c.json({ error: err.message }, 404);
    console.error("Bundle tree error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

bundle.get("/:ws/bundles/:bundleId/file", authenticate, async (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "Missing 'path' query parameter" }, 400);
  if (!validatePathSafety(filePath)) return c.json({ error: "Invalid file path" }, 400);

  const key = storageKey(c.req.param("ws"), c.req.param("bundleId"));
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
});

export const bundleRoutes = bundle;
