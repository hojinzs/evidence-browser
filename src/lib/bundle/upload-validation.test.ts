import { describe, it, expect } from "vitest";
import {
  validateUploadedFile,
  validateBundleSize,
  validateBundleId,
  deriveAndValidateBundleId,
} from "./upload-validation";

function makeFile(name: string, size: number, type = "application/zip"): File {
  // Build a File whose byte length equals `size` without actually allocating
  // large buffers (important for the "too-large" test which uses numbers
  // orders of magnitude above node's typical heap).
  const parts = [new Uint8Array(Math.min(size, 16))]; // tiny payload
  const blob = new Blob(parts, { type });
  // File is a Blob subclass; override size via Object.defineProperty
  // because Blob.size is a readonly getter.
  const file = new File([blob], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

// ---------------------------------------------------------------------------
// validateUploadedFile
// ---------------------------------------------------------------------------
describe("validateUploadedFile", () => {
  it("accepts a .zip file", () => {
    const result = validateUploadedFile(makeFile("bundle.zip", 100));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("bundle.zip");
    }
  });

  it("rejects a null file with 400", () => {
    const result = validateUploadedFile(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.kind).toBe("bad-extension");
    }
  });

  it("rejects an undefined file with 400", () => {
    const result = validateUploadedFile(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
    }
  });

  it("rejects a non-.zip file with 400", () => {
    const result = validateUploadedFile(makeFile("evil.exe", 100));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.kind).toBe("bad-extension");
    }
  });

  it("rejects a file with no extension", () => {
    const result = validateUploadedFile(makeFile("bundle", 100));
    expect(result.ok).toBe(false);
  });

  it("rejects a file whose name pretends to be a zip (.zip in middle)", () => {
    const result = validateUploadedFile(makeFile("bundle.zip.exe", 100));
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateBundleSize
// ---------------------------------------------------------------------------
describe("validateBundleSize", () => {
  it("accepts a file at the size limit", () => {
    const result = validateBundleSize(100, 100);
    expect(result.ok).toBe(true);
  });

  it("accepts a file under the size limit", () => {
    const result = validateBundleSize(50, 100);
    expect(result.ok).toBe(true);
  });

  it("rejects a file over the limit with 413", () => {
    const result = validateBundleSize(101, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(413);
      expect(result.error.kind).toBe("too-large");
      expect(result.error.message).toContain("100");
    }
  });

  it("rejects an enormous file with 413", () => {
    const maxSize = 500 * 1024 * 1024; // 500MB
    const result = validateBundleSize(maxSize * 2, maxSize);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(413);
    }
  });
});

// ---------------------------------------------------------------------------
// validateBundleId
// ---------------------------------------------------------------------------
describe("validateBundleId", () => {
  it("accepts a simple alphanumeric bundleId", () => {
    const result = validateBundleId("my-bundle-123");
    expect(result.ok).toBe(true);
  });

  it("accepts a bundleId with dots and dashes that don't form traversal", () => {
    const result = validateBundleId("ci-run-2024-04-08.v1");
    expect(result.ok).toBe(true);
  });

  it("rejects an empty bundleId with 400", () => {
    const result = validateBundleId("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.kind).toBe("bad-bundle-id");
    }
  });

  it("rejects null", () => {
    const result = validateBundleId(null);
    expect(result.ok).toBe(false);
  });

  it("rejects undefined", () => {
    const result = validateBundleId(undefined);
    expect(result.ok).toBe(false);
  });

  it("rejects a bundleId containing .. with 400 (path traversal)", () => {
    const result = validateBundleId("..");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
    }
  });

  it("rejects ../etc/passwd with 400", () => {
    const result = validateBundleId("../etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("rejects a bundleId with .. embedded", () => {
    const result = validateBundleId("foo..bar");
    expect(result.ok).toBe(false);
  });

  it("rejects a bundleId containing / with 400 (path separator)", () => {
    const result = validateBundleId("foo/bar");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
    }
  });

  it("rejects a bundleId starting with / with 400", () => {
    const result = validateBundleId("/absolute");
    expect(result.ok).toBe(false);
  });

  it("rejects a bundleId containing \\0 with 400 (null byte)", () => {
    const result = validateBundleId("foo\0bar");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// deriveAndValidateBundleId
// ---------------------------------------------------------------------------
describe("deriveAndValidateBundleId", () => {
  it("prefers the explicit bundleId when provided", () => {
    const result = deriveAndValidateBundleId("explicit-id", "file.zip");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("explicit-id");
    }
  });

  it("falls back to the filename (stripped of .zip) when explicit is empty", () => {
    const result = deriveAndValidateBundleId("", "my-bundle.zip");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("my-bundle");
    }
  });

  it("falls back to the filename when explicit is null", () => {
    const result = deriveAndValidateBundleId(null, "backup-2024.zip");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("backup-2024");
    }
  });

  it("falls back to the filename when explicit is undefined", () => {
    const result = deriveAndValidateBundleId(undefined, "bundle.zip");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("bundle");
    }
  });

  it("rejects an explicit bundleId that contains ..", () => {
    const result = deriveAndValidateBundleId("../evil", "bundle.zip");
    expect(result.ok).toBe(false);
  });

  it("rejects a derived bundleId (from filename) that contains ..", () => {
    const result = deriveAndValidateBundleId(null, "../evil.zip");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("bad-bundle-id");
    }
  });

  it("rejects a derived bundleId (from filename) that contains /", () => {
    const result = deriveAndValidateBundleId(null, "subdir/bundle.zip");
    expect(result.ok).toBe(false);
  });

  it("rejects a derived bundleId (from filename) that contains \\0", () => {
    const result = deriveAndValidateBundleId(null, "foo\0bar.zip");
    expect(result.ok).toBe(false);
  });

  it("rejects when both explicit and filename-derived IDs are empty", () => {
    const result = deriveAndValidateBundleId("", ".zip");
    expect(result.ok).toBe(false);
  });
});
