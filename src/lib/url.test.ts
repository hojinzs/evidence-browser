import { describe, it, expect } from "vitest";
import { parseSegments } from "./url";

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
