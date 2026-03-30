import { describe, it, expect } from "vitest";
import { detectFileType, getMimeType, getShikiLanguage } from "./detect";

describe("detectFileType", () => {
  it("detects markdown files", () => {
    expect(detectFileType("readme.md")).toBe("markdown");
    expect(detectFileType("doc.mdx")).toBe("markdown");
  });

  it("detects image files", () => {
    expect(detectFileType("photo.png")).toBe("image");
    expect(detectFileType("photo.jpg")).toBe("image");
    expect(detectFileType("photo.jpeg")).toBe("image");
    expect(detectFileType("icon.svg")).toBe("image");
    expect(detectFileType("anim.gif")).toBe("image");
  });

  it("detects code files", () => {
    expect(detectFileType("app.ts")).toBe("code");
    expect(detectFileType("app.py")).toBe("code");
    expect(detectFileType("config.json")).toBe("code");
    expect(detectFileType("script.sh")).toBe("code");
    expect(detectFileType("style.css")).toBe("code");
  });

  it("detects text files", () => {
    expect(detectFileType("readme.txt")).toBe("text");
    expect(detectFileType("app.log")).toBe("text");
    expect(detectFileType("data.csv")).toBe("text");
  });

  it("returns binary for unknown extensions", () => {
    expect(detectFileType("data.bin")).toBe("binary");
    expect(detectFileType("archive.tar.gz")).toBe("binary");
    expect(detectFileType("doc.pdf")).toBe("binary");
  });
});

describe("getMimeType", () => {
  it("returns correct MIME types", () => {
    expect(getMimeType("photo.png")).toBe("image/png");
    expect(getMimeType("icon.svg")).toBe("image/svg+xml");
    expect(getMimeType("data.json")).toBe("application/json");
  });

  it("defaults to text/plain for unknown types", () => {
    expect(getMimeType("file.txt")).toBe("text/plain; charset=utf-8");
    expect(getMimeType("file.log")).toBe("text/plain; charset=utf-8");
  });
});

describe("getShikiLanguage", () => {
  it("maps extensions to languages", () => {
    expect(getShikiLanguage("test.py")).toBe("python");
    expect(getShikiLanguage("app.ts")).toBe("typescript");
    expect(getShikiLanguage("script.sh")).toBe("bash");
    expect(getShikiLanguage("config.json")).toBe("json");
  });

  it("returns undefined for unknown extensions", () => {
    expect(getShikiLanguage("data.bin")).toBeUndefined();
  });
});
