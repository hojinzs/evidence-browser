import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFSAdapter } from "./local";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.promises.rm(dir, { recursive: true, force: true }))
  );
});

describe("LocalFSAdapter", () => {
  it("deletes a stored bundle zip and prunes empty directories", async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-storage-"));
    tempDirs.push(baseDir);
    const adapter = new LocalFSAdapter(baseDir);

    await adapter.putBundle("demo/sample-bundle", Buffer.from("zip-content"));

    const zipPath = path.join(baseDir, "demo", "sample-bundle.zip");
    expect(fs.existsSync(zipPath)).toBe(true);

    await adapter.deleteBundle("demo/sample-bundle");

    expect(fs.existsSync(zipPath)).toBe(false);
    expect(fs.existsSync(path.join(baseDir, "demo"))).toBe(false);
  });

  it("treats missing bundle files as already deleted", async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-storage-"));
    tempDirs.push(baseDir);
    const adapter = new LocalFSAdapter(baseDir);

    await expect(adapter.deleteBundle("demo/missing-bundle")).resolves.toBeUndefined();
  });
});
