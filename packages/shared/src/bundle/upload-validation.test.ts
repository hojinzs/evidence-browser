import { describe, expect, it } from "vitest";
import {
  deriveAndValidateBundleId,
  validateBundleId,
  validateBundleSize,
} from "./upload-validation";

describe("validateBundleSize", () => {
  it("accepts a size within the limit", () => {
    expect(validateBundleSize(100, 200)).toEqual({ ok: true, value: 100 });
  });

  it("rejects a size over the limit", () => {
    expect(validateBundleSize(201, 200)).toMatchObject({
      ok: false,
      error: { kind: "too-large", status: 413 },
    });
  });
});

describe("validateBundleId", () => {
  it("accepts flat lowercase bundle ids", () => {
    expect(validateBundleId("pr-42-run-1")).toEqual({ ok: true, value: "pr-42-run-1" });
    expect(validateBundleId("org-repo-pr-42-run-1")).toEqual({ ok: true, value: "org-repo-pr-42-run-1" });
  });

  it("rejects slash-delimited bundle ids", () => {
    expect(validateBundleId("pr-42/run-1")).toMatchObject({
      ok: false,
      error: { kind: "bad-bundle-id", status: 400 },
    });
  });

  it("rejects uppercase bundle ids", () => {
    expect(validateBundleId("PR-42")).toMatchObject({ ok: false });
  });

  it("rejects whitespace and percent-encoded separators", () => {
    expect(validateBundleId("pr 42")).toMatchObject({ ok: false });
    expect(validateBundleId("pr%2F42")).toMatchObject({ ok: false });
  });

  it("rejects traversal and backslashes", () => {
    expect(validateBundleId("../run-1")).toMatchObject({ ok: false });
    expect(validateBundleId("pr-42\\run-1")).toMatchObject({ ok: false });
  });
});

describe("deriveAndValidateBundleId", () => {
  it("uses the explicit bundleId when provided", () => {
    expect(deriveAndValidateBundleId("explicit-id", "ignored.zip")).toEqual({
      ok: true,
      value: "explicit-id",
    });
  });

  it("derives from the zip filename when omitted", () => {
    expect(deriveAndValidateBundleId(undefined, "pr-42-run-1.zip")).toEqual({
      ok: true,
      value: "pr-42-run-1",
    });
  });
});
