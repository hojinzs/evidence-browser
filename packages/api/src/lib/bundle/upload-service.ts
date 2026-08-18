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
import { createBundle, type BundleRow } from "@/lib/db/bundles";
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
  | { ok: false; status: 400 | 413 | 501; error: string };

export async function uploadBundleFromMultipart(
  options: MultipartBundleUploadOptions
): Promise<MultipartBundleUploadResult> {
  const formData = await options.request.formData().catch(() => null);
  if (!formData) return { ok: false, status: 400, error: "Invalid form data" };

  const rawFile = formData.get("file") as File | null;
  const fileResult = validateUploadedFile(rawFile);
  if (!fileResult.ok) {
    return { ok: false, status: fileResult.error.status, error: fileResult.error.message };
  }
  const file = fileResult.value;

  const rawBundleId = formData.get("bundleId") as string | null;
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
    await storage.putBundle(key, buffer);

    return {
      ok: true,
      status: 201,
      bundle: createBundle({
        bundleId,
        workspaceId: options.workspace.id,
        title,
        storageKey: key,
        sizeBytes: buffer.byteLength,
        uploadedBy: options.uploadedBy,
      }),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
