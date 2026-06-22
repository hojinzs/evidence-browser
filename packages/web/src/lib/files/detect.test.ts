import { describe, expect, it } from "vitest";
import { detectFileType, getShikiLanguage } from "./detect";

describe("detectFileType", () => {
  it("routes HTML files to the dedicated HTML viewer type", () => {
    expect(detectFileType("reports/index.html")).toBe("html");
  });
});

describe("getShikiLanguage", () => {
  it("keeps HTML source highlighting available", () => {
    expect(getShikiLanguage("reports/index.html")).toBe("html");
  });
});
