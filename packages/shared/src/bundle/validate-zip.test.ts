import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IndexFileNotFoundError,
  ManifestNotFoundError,
  ManifestValidationError,
} from "./types";
import { validateBundleZip } from "./validate-zip";

interface ZipFixtureEntry {
  name: string;
  content: string;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function writeZipFixture(zipPath: string, entries: ZipFixtureEntry[]): Promise<void> {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filename = Buffer.from(entry.name, "utf-8");
    const content = Buffer.from(entry.content, "utf-8");
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, filename, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(filename.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, filename);
    offset += localHeader.length + filename.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  await fs.promises.writeFile(
    zipPath,
    Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory])
  );
}

describe("validateBundleZip", () => {
  let tempDir: string;
  let zipPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "evidence-validate-zip-"));
    zipPath = path.join(tempDir, "bundle.zip");
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("throws ManifestNotFoundError when manifest.json is missing", async () => {
    await writeZipFixture(zipPath, [{ name: "index.md", content: "# Index" }]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(ManifestNotFoundError);
  });

  it("throws ManifestValidationError when manifest.json is invalid JSON", async () => {
    await writeZipFixture(zipPath, [
      { name: "manifest.json", content: "{" },
      { name: "index.md", content: "# Index" },
    ]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it("throws ManifestValidationError when manifest.json fails schema validation", async () => {
    await writeZipFixture(zipPath, [
      {
        name: "manifest.json",
        content: JSON.stringify({ version: 1, title: "Missing index" }),
      },
      { name: "index.md", content: "# Index" },
    ]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(ManifestValidationError);
  });

  it("throws IndexFileNotFoundError when the manifest index file is missing", async () => {
    await writeZipFixture(zipPath, [
      {
        name: "manifest.json",
        content: JSON.stringify({ version: 1, title: "Missing index file", index: "index.md" }),
      },
      { name: "other.md", content: "# Other" },
    ]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(IndexFileNotFoundError);
  });

  it("returns the manifest title when manifest.json and index file are present", async () => {
    await writeZipFixture(zipPath, [
      {
        name: "manifest.json",
        content: JSON.stringify({ version: 1, title: "Valid bundle", index: "index.md" }),
      },
      { name: "index.md", content: "# Index" },
    ]);

    await expect(validateBundleZip(zipPath)).resolves.toEqual({ title: "Valid bundle" });
  });
});
