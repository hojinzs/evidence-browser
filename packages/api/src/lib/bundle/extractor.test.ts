import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { extractBundle, getFileContent } from "./extractor";
import { BundleSizeLimitError, FileCountLimitError } from "./types";
import type { BundleInfo, StorageAdapter } from "@/lib/storage";

interface ZipFixtureEntry {
  name: string;
  content: string;
}

const storageState = vi.hoisted(() => ({
  bundleInfo: { exists: true, size: 0, etag: "initial" } as BundleInfo,
  bundleZip: Buffer.alloc(0) as Buffer<ArrayBufferLike>,
  getBundleInfo: vi.fn(),
  getBundleStream: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: (): StorageAdapter => ({
    getBundleInfo: storageState.getBundleInfo,
    getBundleStream: storageState.getBundleStream,
  }),
}));

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

function makeZipFixture(entries: ZipFixtureEntry[]): Buffer<ArrayBufferLike> {
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

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function setEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): void {
  process.env.NODE_ENV = "test";
  process.env.MAX_BUNDLE_SIZE = "1000000";
  process.env.MAX_FILE_COUNT = "100";
  process.env.MAX_SINGLE_FILE_SIZE = "1000000";
  process.env.CACHE_TTL_MS = "1800000";
  process.env.CACHE_MAX_ENTRIES = "50";
  Object.assign(process.env, overrides);
  resetEnv();
}

function setBundleZip(entries: ZipFixtureEntry[], etag: string): void {
  storageState.bundleZip = makeZipFixture(entries);
  storageState.bundleInfo = {
    exists: true,
    size: storageState.bundleZip.byteLength,
    etag,
  };
}

function validManifest(title: string): string {
  return JSON.stringify({ version: 1, title, index: "index.md" });
}

function treePaths(entry: Awaited<ReturnType<typeof extractBundle>>): string[] {
  return entry.fileTree.flatMap((node) => [
    node.path,
    ...(node.children?.map((child) => child.path) ?? []),
  ]);
}

let originalEnv: NodeJS.ProcessEnv;

describe("extractBundle ZIP guard behavior", () => {
  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    setEnv();
    storageState.getBundleInfo.mockImplementation(async () => storageState.bundleInfo);
    storageState.getBundleStream.mockImplementation(async () => {
      const nodeStream = Readable.from(storageState.bundleZip);
      return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnv();
  });

  it("skips traversal entries without extracting them", async () => {
    setBundleZip(
      [
        { name: "../secret.txt", content: "do not write" },
        { name: "manifest.json", content: validManifest("Traversal fixture") },
        { name: "index.md", content: "# Safe index\n" },
      ],
      "traversal"
    );

    const entry = await extractBundle("traversal-fixture");

    expect(treePaths(entry)).toEqual(["index.md", "manifest.json"]);
    await expect(fs.promises.access(path.join(entry.cacheDir, "..", "secret.txt"))).rejects.toThrow();
    await expect(getFileContent(entry.cacheDir, "index.md")).resolves.toEqual(
      Buffer.from("# Safe index\n")
    );
  });

  it("throws FileCountLimitError when safe entries exceed MAX_FILE_COUNT", async () => {
    setEnv({ MAX_FILE_COUNT: "2" });
    setBundleZip(
      [
        { name: "manifest.json", content: validManifest("Count fixture") },
        { name: "index.md", content: "# Count index\n" },
        { name: "extra.txt", content: "third safe file" },
      ],
      "count-limit"
    );

    await expect(extractBundle("count-limit-fixture")).rejects.toBeInstanceOf(
      FileCountLimitError
    );
  });

  it("counts unsafe entries against MAX_FILE_COUNT before skipping them", async () => {
    setEnv({ MAX_FILE_COUNT: "2" });
    setBundleZip(
      [
        { name: "../first.txt", content: "skip one" },
        { name: "../second.txt", content: "skip two" },
        { name: "../third.txt", content: "skip three" },
      ],
      "unsafe-count-limit"
    );

    await expect(extractBundle("unsafe-count-limit-fixture")).rejects.toBeInstanceOf(
      FileCountLimitError
    );
  });

  it("throws BundleSizeLimitError before streaming oversized bundle zips", async () => {
    setEnv({ MAX_BUNDLE_SIZE: "10" });
    setBundleZip(
      [
        { name: "manifest.json", content: validManifest("Oversized bundle") },
        { name: "index.md", content: "# Oversized bundle\n" },
      ],
      "bundle-size-limit"
    );
    storageState.bundleInfo = {
      ...storageState.bundleInfo,
      size: 11,
    };

    await expect(extractBundle("oversized-bundle-fixture")).rejects.toBeInstanceOf(
      BundleSizeLimitError
    );
    expect(storageState.getBundleStream).not.toHaveBeenCalled();
  });

  it("skips members over MAX_SINGLE_FILE_SIZE while extracting the rest", async () => {
    setEnv({ MAX_SINGLE_FILE_SIZE: "80" });
    setBundleZip(
      [
        { name: "manifest.json", content: validManifest("Member size fixture") },
        { name: "index.md", content: "# Member size index\n" },
        { name: "large.bin", content: "x".repeat(81) },
      ],
      "member-size-limit"
    );

    const entry = await extractBundle("member-size-limit-fixture");

    expect(treePaths(entry)).toEqual(["index.md", "manifest.json"]);
    await expect(fs.promises.access(path.join(entry.cacheDir, "large.bin"))).rejects.toThrow();
  });
});
