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
  it("parses bundle landing (no /f/)", () => {
    expect(parseSegments(["org", "repo", "pr-182", "run-1"])).toEqual({
      bundleId: "org/repo/pr-182/run-1",
      filePath: null,
    });
  });

  it("parses file path with /f/ delimiter", () => {
    expect(
      parseSegments(["org", "repo", "run-1", "f", "logs", "app.log"])
    ).toEqual({
      bundleId: "org/repo/run-1",
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
    expect(parseSegments(["sample", "basic", "f", "index.md"])).toEqual({
      bundleId: "sample/basic",
      filePath: "index.md",
    });
  });

  it("returns null filePath when f is last segment", () => {
    expect(parseSegments(["sample", "basic", "f"])).toEqual({
      bundleId: "sample/basic",
      filePath: null,
    });
  });
});

describe("workspace-aware URL helpers", () => {
  it("bundleFileUrl includes workspace", () => {
    expect(bundleFileUrl("infra", "pr-42", "logs/app.log")).toBe(
      "/w/infra/b/pr-42/f/logs/app.log"
    );
  });

  it("bundleLandingUrl includes workspace", () => {
    expect(bundleLandingUrl("infra", "pr-42")).toBe("/w/infra/b/pr-42");
  });

  it("workspaceUrl", () => {
    expect(workspaceUrl("infra")).toBe("/w/infra");
  });

  it("apiBundleUrl includes workspace", () => {
    expect(apiBundleUrl("infra", "pr-42", "meta")).toBe(
      "/api/w/infra/bundle/pr-42/meta"
    );
  });

  it("apiBundleUrl encodes slashes in bundleId", () => {
    expect(apiBundleUrl("infra", "org/repo/pr-42", "file")).toBe(
      "/api/w/infra/bundle/org%2Frepo%2Fpr-42/file"
    );
  });

  it("storageKey", () => {
    expect(storageKey("infra", "pr-42")).toBe("infra/pr-42");
  });
});
