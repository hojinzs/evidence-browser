/**
 * Pure helpers for validating bundle upload inputs.
 *
 * These are the rules enforced by `POST /api/w/[ws]/bundle`. They are
 * extracted here so they can be unit-tested independently of a live
 * Next.js route handler. The upload route itself continues to call the
 * same helpers, so tests of these functions serve as regression tests
 * for the HTTP validation behavior.
 *
 * Every helper returns a discriminated result object rather than throwing,
 * so callers can map failures to HTTP status codes without try/catch.
 */

export type UploadValidationError =
  | { kind: "missing-file"; message: string; status: 400 }
  | { kind: "bad-extension"; message: string; status: 400 }
  | { kind: "too-large"; message: string; status: 413 }
  | { kind: "bad-bundle-id"; message: string; status: 400 };

export type UploadValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: UploadValidationError };

/**
 * Validates the uploaded File object's basic shape.
 * Checks: presence and `.zip` extension. Does NOT check size (see
 * `validateBundleSize`) because callers often want to run it before
 * reading the full body.
 */
export function validateUploadedFile(
  file: File | null | undefined
): UploadValidationResult<File> {
  if (!file) {
    return {
      ok: false,
      error: {
        kind: "bad-extension",
        message: "A .zip file is required",
        status: 400,
      },
    };
  }
  if (!file.name.endsWith(".zip")) {
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

/**
 * Rejects files whose declared size exceeds the configured limit.
 * Returns 413 on failure to match the upload route's existing behavior.
 */
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

/**
 * Validates that a bundleId is safe for use as part of a storage key
 * and file path. Rejects empty strings, path traversal (`..`), any
 * path separators (`/`), and null bytes (`\0`).
 *
 * Mirrors the in-line checks in `src/app/api/w/[ws]/bundle/route.ts`
 * and `src/lib/url.ts:storageKey`.
 */
export function validateBundleId(
  bundleId: string | null | undefined
): UploadValidationResult<string> {
  if (!bundleId) {
    return {
      ok: false,
      error: {
        kind: "bad-bundle-id",
        message: "Invalid bundleId",
        status: 400,
      },
    };
  }
  if (
    bundleId.includes("..") ||
    bundleId.includes("/") ||
    bundleId.includes("\0")
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

/**
 * Derives the bundleId from either an explicit form field or the
 * uploaded filename (stripping the `.zip` extension), then validates
 * it. Mirrors `const bundleId = (formData.get("bundleId") as string) ||
 * file.name.replace(/\.zip$/, "")` from the upload route.
 */
export function deriveAndValidateBundleId(
  explicit: string | null | undefined,
  filename: string
): UploadValidationResult<string> {
  const candidate = explicit || filename.replace(/\.zip$/, "");
  return validateBundleId(candidate);
}
