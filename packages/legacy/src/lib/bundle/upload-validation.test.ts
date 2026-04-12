import { describe, expect, it } from "vitest";
import {
  deriveAndValidateBundleId,
  validateBundleId,
  validateBundleSize,
  validateUploadedFile,
} from "./upload-validation";

function makeFile(name: string, size: number, type = "application/zip"): File {
  const parts = [new Uint8Array(Math.min(size, 16))];
  const blob = new Blob(parts, { type });
  const file = new File([blob], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateUploadedFile", () => {
  it("accepts a .zip file", () => {
    const result = validateUploadedFile(makeFile("bundle.zip", 100));
    expect(result.ok).toBe(true);
  });

  it("rejects missing and invalid extensions", () => {
    expect(validateUploadedFile(null)).toMatchObject({ ok: false });
    expect(validateUploadedFile(undefined)).toMatchObject({ ok: false });
    expect(validateUploadedFile(makeFile("evil.exe", 100))).toMatchObject({ ok: false });
  });
});

describe("validateBundleSize", () => {
  it("accepts a file at the size limit", () => {
    expect(validateBundleSize(100, 100)).toEqual({ ok: true, value: 100 });
  });

  it("rejects a file over the limit with 413", () => {
    expect(validateBundleSize(101, 100)).toMatchObject({
      ok: false,
      error: { kind: "too-large", status: 413 },
    });
  });
});

describe("validateBundleId", () => {
  it("accepts flat lowercase bundle ids", () => {
    expect(validateBundleId("pr-42-run-1")).toEqual({ ok: true, value: "pr-42-run-1" });
    expect(validateBundleId("ci-run-2024-04-08.v1")).toEqual({ ok: true, value: "ci-run-2024-04-08.v1" });
  });

  it("rejects traversal and separators", () => {
    expect(validateBundleId("..")).toMatchObject({ ok: false });
    expect(validateBundleId("../etc/passwd")).toMatchObject({ ok: false });
    expect(validateBundleId("foo/bar")).toMatchObject({ ok: false });
    expect(validateBundleId("foo\\bar")).toMatchObject({ ok: false });
    expect(validateBundleId("foo\0bar")).toMatchObject({ ok: false });
  });

  it("rejects uppercase, spaces, and percent-encoded separators", () => {
    expect(validateBundleId("PR-42")).toMatchObject({ ok: false });
    expect(validateBundleId("pr 42")).toMatchObject({ ok: false });
    expect(validateBundleId("pr%2F42")).toMatchObject({ ok: false });
  });
});

describe("deriveAndValidateBundleId", () => {
  it("prefers the explicit bundleId when provided", () => {
    expect(deriveAndValidateBundleId("explicit-id", "file.zip")).toEqual({
      ok: true,
      value: "explicit-id",
    });
  });

  it("falls back to the filename when explicit is empty", () => {
    expect(deriveAndValidateBundleId("", "my-bundle.zip")).toEqual({
      ok: true,
      value: "my-bundle",
    });
  });

  it("rejects invalid explicit or derived bundle ids", () => {
    expect(deriveAndValidateBundleId("../evil", "bundle.zip")).toMatchObject({ ok: false });
    expect(deriveAndValidateBundleId(null, "../evil.zip")).toMatchObject({ ok: false });
    expect(deriveAndValidateBundleId(null, "subdir/bundle.zip")).toMatchObject({ ok: false });
    expect(deriveAndValidateBundleId(null, "PR-42.zip")).toMatchObject({ ok: false });
  });
});
