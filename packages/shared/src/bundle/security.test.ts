import { describe, it, expect } from "vitest";
import { validatePathSafety, ensureWithinRoot } from "./security";

describe("validatePathSafety", () => {
  it("rejects path traversal with ..", () => {
    expect(validatePathSafety("../etc/passwd")).toBe(false);
    expect(validatePathSafety("a/../../../etc/passwd")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(validatePathSafety("/etc/passwd")).toBe(false);
  });

  it("rejects null bytes", () => {
    expect(validatePathSafety("file\0name")).toBe(false);
  });

  it("accepts normal relative paths", () => {
    expect(validatePathSafety("normal/path.txt")).toBe(true);
    expect(validatePathSafety("logs/app.log")).toBe(true);
    expect(validatePathSafety("a/b/c/d/e/deep.txt")).toBe(true);
  });

  it("accepts files in root", () => {
    expect(validatePathSafety("manifest.json")).toBe(true);
    expect(validatePathSafety("index.md")).toBe(true);
  });
});

describe("ensureWithinRoot", () => {
  it("accepts paths within root", () => {
    expect(ensureWithinRoot("/tmp/x", "/tmp/x/a/b")).toBe(true);
    expect(ensureWithinRoot("/tmp/x", "/tmp/x/file.txt")).toBe(true);
  });

  it("rejects paths outside root", () => {
    expect(ensureWithinRoot("/tmp/x", "/tmp/y/a")).toBe(false);
    expect(ensureWithinRoot("/tmp/x", "/etc/passwd")).toBe(false);
  });

  it("rejects traversal attempts that resolve outside", () => {
    expect(ensureWithinRoot("/tmp/x", "/tmp/x/../y")).toBe(false);
  });
});
