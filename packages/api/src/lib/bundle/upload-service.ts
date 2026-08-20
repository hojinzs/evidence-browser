import fs from "fs";
import os from "os";
import path from "path";
import type { Workspace } from "@evidence-browser/shared/api/types";
import { getEnv } from "@/config/env";
import { validateBundleZip } from "@/lib/bundle/extractor";
import {
  deriveAndValidateBundleId,
  validateBundleId,
  validateBundleSize,
  validateUploadedFile,
} from "@/lib/bundle/upload-validation";
import { createBundle, deleteBundle, type BundleRow } from "@/lib/db/bundles";
import { getStorageAdapter } from "@/lib/storage";
import { storageKey } from "@/lib/url";

export type MultipartBundleUploadOptions = {
  request: Request;
  workspace: Workspace;
  uploadedBy: string;
  pinnedBundleId?: string;
};

export type MultipartBundleUploadResult =
  | { ok: true; status: 201; bundle: BundleRow }
  | { ok: false; status: 400 | 409 | 413 | 501; error: string };

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function isSqliteConstraint(error: unknown, constraint: "UNIQUE" | "FOREIGNKEY"): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === `SQLITE_CONSTRAINT_${constraint}`
  );
}

export async function uploadBundleFromMultipart(
  options: MultipartBundleUploadOptions
): Promise<MultipartBundleUploadResult> {
  const formData = await options.request.formData().catch(() => null);
  if (!formData) return { ok: false, status: 400, error: "Invalid form data" };

  const rawFile = formData.get("file");
  const fileResult = validateUploadedFile(isFile(rawFile) ? rawFile : null);
  if (!fileResult.ok) {
    return { ok: false, status: fileResult.error.status, error: fileResult.error.message };
  }
  const file = fileResult.value;

  const rawBundleId = formData.get("bundleId");
  if (rawBundleId !== null && typeof rawBundleId !== "string") {
    return { ok: false, status: 400, error: "Invalid bundleId" };
  }
  const bundleIdResult = options.pinnedBundleId
    ? validateBundleId(options.pinnedBundleId)
    : deriveAndValidateBundleId(rawBundleId, file.name);
  if (!bundleIdResult.ok) {
    return { ok: false, status: bundleIdResult.error.status, error: bundleIdResult.error.message };
  }
  const bundleId = bundleIdResult.value;

  if (options.pinnedBundleId && rawBundleId !== null && rawBundleId !== bundleId) {
    return { ok: false, status: 400, error: "bundleId does not match signed upload URL" };
  }

  const env = getEnv();
  const buffer = Buffer.from(await file.arrayBuffer());
  const sizeResult = validateBundleSize(buffer.byteLength, env.MAX_BUNDLE_SIZE);
  if (!sizeResult.ok) {
    return { ok: false, status: sizeResult.error.status, error: sizeResult.error.message };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-upload-"));
  const tmpZip = path.join(tmpDir, "upload.zip");

  try {
    fs.writeFileSync(tmpZip, buffer);
    const key = storageKey(options.workspace.slug, bundleId);

    let title: string | null = null;
    try {
      title = (await validateBundleZip(tmpZip, {
        maxEntries: env.MAX_FILE_COUNT,
        maxTotalUncompressedBytes: env.MAX_BUNDLE_SIZE,
        maxEntryBytes: env.MAX_SINGLE_FILE_SIZE,
        maxManifestBytes: env.MAX_SINGLE_FILE_SIZE,
      })).title;
    } catch (error) {
      return {
        ok: false,
        status: 400,
        error: error instanceof Error ? error.message : "Bundle validation failed",
      };
    }

    const storage = getStorageAdapter();
    if (!storage.putBundle) {
      return { ok: false, status: 501, error: "Storage adapter does not support upload" };
    }
    let bundle: BundleRow;
    try {
      bundle = createBundle({
        bundleId,
        workspaceId: options.workspace.id,
        title,
        storageKey: key,
        sizeBytes: buffer.byteLength,
        uploadedBy: options.uploadedBy,
      });
    } catch (error) {
      if (isSqliteConstraint(error, "UNIQUE")) {
        return { ok: false, status: 409, error: "Bundle already exists" };
      }
      if (isSqliteConstraint(error, "FOREIGNKEY")) {
        return { ok: false, status: 400, error: "Invalid uploader" };
      }
      throw error;
    }

    try {
      await storage.putBundle(key, buffer);
    } catch (error) {
      deleteBundle(bundle.id);
      throw error;
    }

    return { ok: true, status: 201, bundle };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
