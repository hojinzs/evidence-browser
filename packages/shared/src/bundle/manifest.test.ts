import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";

describe("parseManifest", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "evidence-manifest-"));
  });

  afterEach(async () => {
    await fs.promises.rm(cacheDir, { recursive: true, force: true });
  });

  it("reports a missing manifest in English", async () => {
    await expect(parseManifest(cacheDir)).rejects.toThrow("manifest.json was not found");
  });

  it("reports invalid manifest JSON in English", async () => {
    await fs.promises.writeFile(path.join(cacheDir, "manifest.json"), "{", "utf-8");

    await expect(parseManifest(cacheDir)).rejects.toThrow("manifest.json validation failed: Invalid JSON");
  });

  it("reports missing required manifest fields in English", async () => {
    await fs.promises.writeFile(
      path.join(cacheDir, "manifest.json"),
      JSON.stringify({ version: 1, title: "Missing index" }),
      "utf-8"
    );

    await expect(parseManifest(cacheDir)).rejects.toThrow(
      "manifest.json validation failed: Missing required field(s): index"
    );
  });

  it("reports a missing index file in English", async () => {
    await fs.promises.writeFile(
      path.join(cacheDir, "manifest.json"),
      JSON.stringify({ version: 1, title: "Missing index file", index: "index.md" }),
      "utf-8"
    );

    await expect(parseManifest(cacheDir)).rejects.toThrow("Index file not found: index.md");
  });
});
