import { describe, expect, it } from "vitest";
import { validateBundleId } from "./bundle/upload-validation";
import {
  apiBundleUrl,
  apiShareUrl,
  bundleFileUrl,
  bundleLandingUrl,
  parseSegments,
  shareFileUrl,
  shareLandingUrl,
  storageKey,
  workspaceUrl,
} from "./url";

describe("parseSegments", () => {
  it("parses bundle landing from a single bundle segment", () => {
    expect(parseSegments(["pr-182-run-1"])).toEqual({
      bundleId: "pr-182-run-1",
      filePath: null,
    });
  });

  it("parses file path with query-backed marker route", () => {
    expect(parseSegments(["pr-182-run-1", "f", "logs", "app.log"])).toEqual({
      bundleId: "pr-182-run-1",
      filePath: "logs/app.log",
    });
  });

  it("returns null filePath when marker is last segment", () => {
    expect(parseSegments(["pr-182-run-1", "f"])).toEqual({
      bundleId: "pr-182-run-1",
      filePath: null,
    });
  });
});

describe("workspace-aware URL helpers", () => {
  it("builds bundle file URLs with query-string path", () => {
    expect(bundleFileUrl("infra", "pr-42-run-1", "logs/app.log")).toBe(
      "/w/infra/b/pr-42-run-1/f?path=logs%2Fapp.log"
    );
  });

  it("builds landing and workspace URLs", () => {
    expect(bundleLandingUrl("infra", "pr-42-run-1")).toBe("/w/infra/b/pr-42-run-1");
    expect(workspaceUrl("infra")).toBe("/w/infra");
  });

  it("builds canonical API URLs", () => {
    expect(apiBundleUrl("infra", "pr-42-run-1", "meta")).toBe(
      "/api/w/infra/bundles/pr-42-run-1/meta"
    );
    expect(apiBundleUrl("infra", "pr-42-run-1", "preview")).toBe(
      "/api/w/infra/bundles/pr-42-run-1/preview"
    );
  });

  it("builds share URLs", () => {
    expect(shareLandingUrl("ebs_token")).toBe("/s/ebs_token");
    expect(shareFileUrl("ebs_token", "logs/app.log")).toBe(
      "/s/ebs_token/f?path=logs%2Fapp.log"
    );
    expect(apiShareUrl("ebs_token", "file")).toBe("/api/s/ebs_token/file");
    expect(shareLandingUrl("ebs_token/with+reserved")).toBe("/s/ebs_token%2Fwith%2Breserved");
    expect(apiShareUrl("ebs_token/with+reserved", "meta")).toBe(
      "/api/s/ebs_token%2Fwith%2Breserved/meta"
    );
  });

  it("builds storage keys for flat bundle ids", () => {
    expect(storageKey("infra", "pr-42-run-1")).toBe("infra/pr-42-run-1");
  });

  it("rejects slash-delimited bundle ids", () => {
    expect(() => storageKey("infra", "org/repo/pr-42")).toThrow("Invalid bundle identifier");
  });

  it("rejects every string fixture rejected by validateBundleId", () => {
    const rejectedByBundleValidator = [
      "",
      "org/repo/pr-42",
      "org\\repo\\pr-42",
      "../run-1",
      "pr..42",
      "pr\0run",
      "PR-42",
      "pr 42",
      "pr%2F42",
      ".starts-with-dot",
      "-starts-with-dash",
      "_starts-with-underscore",
      "a".repeat(129),
    ].filter((bundleId) => !validateBundleId(bundleId).ok);

    expect(rejectedByBundleValidator).not.toHaveLength(0);
    for (const bundleId of rejectedByBundleValidator) {
      expect(() => storageKey("infra", bundleId)).toThrow("Invalid bundle identifier");
    }
  });
});
