import { describe, expect, it } from "vitest";
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

  it("routes HTML files to the dedicated HTML type", () => {
    expect(detectFileType("reports/index.html")).toBe("html");
    expect(detectFileType("reports\\index.html")).toBe("html");
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

  it("handles Windows-style paths without Node path", () => {
    expect(detectFileType("reports\\index.HTML")).toBe("html");
    expect(detectFileType("bundle\\Dockerfile")).toBe("code");
    expect(detectFileType("Dockerfile")).toBe("code");
    expect(detectFileType("containers\\Dockerfile")).toBe("code");
  });
});

describe("getMimeType", () => {
  it("returns correct MIME types", () => {
    expect(getMimeType("photo.png")).toBe("image/png");
    expect(getMimeType("icon.svg")).toBe("image/svg+xml");
    expect(getMimeType("data.json")).toBe("application/json");
    expect(getMimeType("reports/index.html")).toBe("text/html; charset=utf-8");
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
    expect(getShikiLanguage("reports/index.html")).toBe("html");
    expect(getShikiLanguage("reports\\index.html")).toBe("html");
  });

  it("returns undefined for unknown extensions", () => {
    expect(getShikiLanguage("data.bin")).toBeUndefined();
  });

  it("detects Dockerfile by basename without node path", () => {
    expect(getShikiLanguage("Dockerfile")).toBe("dockerfile");
    expect(getShikiLanguage("containers\\Dockerfile")).toBe("dockerfile");
  });
});
