import * as yauzl from "yauzl-promise";
import { ManifestSchema } from "./manifest";
import {
  IndexFileNotFoundError,
  ManifestNotFoundError,
  ManifestValidationError,
} from "./types";

export async function validateBundleZip(zipPath: string): Promise<{ title: string }> {
  const zipFile = await yauzl.open(zipPath);
  let manifestContent: string | null = null;
  const filenames = new Set<string>();

  try {
    for await (const entry of zipFile) {
      if (entry.filename.endsWith("/")) continue;
      filenames.add(entry.filename);

      if (entry.filename === "manifest.json") {
        const readStream = await entry.openReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of readStream) {
          chunks.push(Buffer.from(chunk));
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
    throw new ManifestValidationError("유효한 JSON이 아닙니다");
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new ManifestValidationError(`필수 필드 누락: ${missing}`);
  }

  if (!filenames.has(result.data.index)) {
    throw new IndexFileNotFoundError(result.data.index);
  }

  return { title: result.data.title };
}
