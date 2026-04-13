export type UploadValidationError =
  | { kind: "missing-file"; message: string; status: 400 }
  | { kind: "bad-extension"; message: string; status: 400 }
  | { kind: "too-large"; message: string; status: 413 }
  | { kind: "bad-bundle-id"; message: string; status: 400 };

export type UploadValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: UploadValidationError };

export function validateUploadedFile(
  file: File | null | undefined
): UploadValidationResult<File> {
  if (!file || !file.name.endsWith(".zip")) {
    return {
      ok: false,
      error: {
        kind: "bad-extension",
        message: "A .zip file is required",
        status: 400,
      },
    };
  }
  return { ok: true, value: file };
}

export function validateBundleSize(
  size: number,
  maxBundleSize: number
): UploadValidationResult<number> {
  if (size > maxBundleSize) {
    return {
      ok: false,
      error: {
        kind: "too-large",
        message: `File too large (max ${maxBundleSize} bytes)`,
        status: 413,
      },
    };
  }
  return { ok: true, value: size };
}

export function validateBundleId(
  bundleId: string | null | undefined
): UploadValidationResult<string> {
  if (
    !bundleId ||
    bundleId.includes("/") ||
    bundleId.includes("\\") ||
    bundleId.includes("..") ||
    bundleId.includes("\0") ||
    bundleId !== bundleId.toLowerCase() ||
    /%[0-9a-f]{2}/i.test(bundleId) ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(bundleId)
  ) {
    return {
      ok: false,
      error: {
        kind: "bad-bundle-id",
        message: "Invalid bundleId",
        status: 400,
      },
    };
  }
  return { ok: true, value: bundleId };
}

export function deriveAndValidateBundleId(
  explicit: string | null | undefined,
  filename: string
): UploadValidationResult<string> {
  const candidate = explicit || filename.replace(/\.zip$/, "");
  return validateBundleId(candidate);
}
