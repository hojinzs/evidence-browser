import * as yauzl from "yauzl-promise";
import { ManifestSchema } from "./manifest";
import {
  BundleSizeLimitError,
  FileCountLimitError,
  IndexFileNotFoundError,
  ManifestNotFoundError,
  ManifestValidationError,
} from "./types";

export interface ValidateBundleZipLimits {
  maxEntries?: number;
  maxTotalUncompressedBytes?: number;
  maxEntryBytes?: number;
  maxManifestBytes?: number;
  maxCompressionRatio?: number;
}

const DEFAULT_LIMITS: Required<ValidateBundleZipLimits> = {
  maxEntries: 10_000,
  maxTotalUncompressedBytes: 500 * 1024 * 1024,
  maxEntryBytes: 100 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024,
  maxCompressionRatio: 100,
};

export async function validateBundleZip(
  zipPath: string,
  limits: ValidateBundleZipLimits = {}
): Promise<{ title: string }> {
  const resolvedLimits = { ...DEFAULT_LIMITS, ...limits };
  const zipFile = await yauzl.open(zipPath);
  let manifestContent: string | null = null;
  const filenames = new Set<string>();
  let entryCount = 0;
  let totalUncompressedBytes = 0;

  try {
    for await (const entry of zipFile) {
      entryCount += 1;
      if (entryCount > resolvedLimits.maxEntries) {
        throw new FileCountLimitError(entryCount, resolvedLimits.maxEntries);
      }

      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > resolvedLimits.maxTotalUncompressedBytes) {
        throw new BundleSizeLimitError(
          totalUncompressedBytes,
          resolvedLimits.maxTotalUncompressedBytes
        );
      }

      if (entry.uncompressedSize > resolvedLimits.maxEntryBytes) {
        throw new BundleSizeLimitError(entry.uncompressedSize, resolvedLimits.maxEntryBytes);
      }

      if (
        entry.uncompressedSize > 0 &&
        (entry.compressedSize === 0 ||
          entry.uncompressedSize / entry.compressedSize > resolvedLimits.maxCompressionRatio)
      ) {
        throw new BundleSizeLimitError(
          entry.uncompressedSize,
          entry.compressedSize * resolvedLimits.maxCompressionRatio
        );
      }

      if (entry.filename.endsWith("/")) continue;
      filenames.add(entry.filename);

      if (entry.filename === "manifest.json") {
        if (entry.uncompressedSize > resolvedLimits.maxManifestBytes) {
          throw new BundleSizeLimitError(entry.uncompressedSize, resolvedLimits.maxManifestBytes);
        }

        const readStream = await entry.openReadStream();
        const chunks: Buffer[] = [];
        let manifestBytes = 0;
        for await (const chunk of readStream) {
          const buffer = Buffer.from(chunk);
          manifestBytes += buffer.byteLength;
          if (manifestBytes > resolvedLimits.maxManifestBytes) {
            throw new BundleSizeLimitError(manifestBytes, resolvedLimits.maxManifestBytes);
          }
          chunks.push(buffer);
        }
        manifestContent = Buffer.concat(chunks).toString("utf-8");
      }
    }
  } finally {
    await zipFile.close();
  }

  if (!manifestContent) {
    throw new ManifestNotFoundError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestContent);
  } catch {
    throw new ManifestValidationError("Invalid JSON");
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new ManifestValidationError(`Missing required field(s): ${missing}`);
  }

  if (!filenames.has(result.data.index)) {
    throw new IndexFileNotFoundError(result.data.index);
  }

  return { title: result.data.title };
}
