import { describe, it, expect } from "vitest";
import {
  parseSegments,
  bundleFileUrl,
  bundleLandingUrl,
  workspaceUrl,
  apiBundleUrl,
  storageKey,
} from "./url";

describe("parseSegments", () => {
  it("parses bundle landing from a single bundle segment", () => {
    expect(parseSegments(["pr-182-run-1"])).toEqual({
      bundleId: "pr-182-run-1",
      filePath: null,
    });
  });

  it("parses file path when the route ends with /f", () => {
    expect(parseSegments(["pr-182-run-1", "f", "logs", "app.log"])).toEqual({
      bundleId: "pr-182-run-1",
      filePath: "logs/app.log",
    });
  });

  it("parses simple bundle ID", () => {
    expect(parseSegments(["simple"])).toEqual({
      bundleId: "simple",
      filePath: null,
    });
  });

  it("parses file in root of bundle", () => {
    expect(parseSegments(["sample-basic", "f", "index.md"])).toEqual({
      bundleId: "sample-basic",
      filePath: "index.md",
    });
  });

  it("returns null filePath when f is last segment", () => {
    expect(parseSegments(["sample-basic", "f"])).toEqual({
      bundleId: "sample-basic",
      filePath: null,
    });
  });
});

describe("workspace-aware URL helpers", () => {
  it("bundleFileUrl includes workspace", () => {
    expect(bundleFileUrl("infra", "pr-42-run-1", "logs/app.log")).toBe(
      "/w/infra/b/pr-42-run-1/f?path=logs%2Fapp.log"
    );
  });

  it("bundleLandingUrl includes workspace", () => {
    expect(bundleLandingUrl("infra", "pr-42-run-1")).toBe("/w/infra/b/pr-42-run-1");
  });

  it("workspaceUrl", () => {
    expect(workspaceUrl("infra")).toBe("/w/infra");
  });

  it("apiBundleUrl includes workspace", () => {
    expect(apiBundleUrl("infra", "pr-42-run-1", "meta")).toBe(
      "/api/w/infra/bundles/pr-42-run-1/meta"
    );
  });

  it("storageKey rejects slash-delimited bundle ids", () => {
    expect(() => storageKey("infra", "org/repo/pr-42")).toThrow(
      "Invalid bundle identifier"
    );
  });

  it("storageKey", () => {
    expect(storageKey("infra", "pr-42-run-1")).toBe("infra/pr-42-run-1");
  });
});
