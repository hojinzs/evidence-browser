import fs from "fs";
import path from "path";
import { z } from "zod/v4";
import type { Manifest } from "./types";
import {
  ManifestNotFoundError,
  ManifestValidationError,
  IndexFileNotFoundError,
} from "./types";

const ManifestSchema = z
  .object({
    version: z.number(),
    title: z.string(),
    index: z.string(),
  })
  .passthrough();

export async function parseManifest(cacheDir: string): Promise<Manifest> {
  const manifestPath = path.join(cacheDir, "manifest.json");

  // Check manifest exists
  try {
    await fs.promises.access(manifestPath);
  } catch {
    throw new ManifestNotFoundError();
  }

  // Read and parse
  const raw = await fs.promises.readFile(manifestPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ManifestValidationError("유효한 JSON이 아닙니다");
  }

  // Validate schema
  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new ManifestValidationError(`필수 필드 누락: ${missing}`);
  }

  // Check index file exists
  const indexPath = path.join(cacheDir, result.data.index);
  try {
    await fs.promises.access(indexPath);
  } catch {
    throw new IndexFileNotFoundError(result.data.index);
  }

  return result.data as Manifest;
}

export { ManifestSchema };
