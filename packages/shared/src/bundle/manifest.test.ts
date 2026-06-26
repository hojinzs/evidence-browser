import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";

let tempDir: string;

describe("parseManifest", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-manifest-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports missing manifests in English", async () => {
    await expect(parseManifest(tempDir)).rejects.toThrow("manifest.json was not found");
  });

  it("reports invalid JSON in English", async () => {
    fs.writeFileSync(path.join(tempDir, "manifest.json"), "{");

    await expect(parseManifest(tempDir)).rejects.toThrow("manifest.json validation failed: Invalid JSON");
  });

  it("reports missing required manifest fields in English", async () => {
    fs.writeFileSync(path.join(tempDir, "manifest.json"), JSON.stringify({ version: 1, title: "Missing index" }));

    await expect(parseManifest(tempDir)).rejects.toThrow(
      "manifest.json validation failed: Missing required field(s): index"
    );
  });

  it("reports a missing index file in English", async () => {
    fs.writeFileSync(path.join(tempDir, "manifest.json"), JSON.stringify({
      version: 1,
      title: "Missing index file",
      index: "index.md",
    }));

    await expect(parseManifest(tempDir)).rejects.toThrow("Index file not found: index.md");
  });
});
