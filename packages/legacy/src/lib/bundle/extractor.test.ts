import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough, Readable } from "stream";
import archiver from "archiver";

// ---------------------------------------------------------------------------
// env mock
// ---------------------------------------------------------------------------
// getEnv() is memoized and reads MAX_BUNDLE_SIZE / MAX_FILE_COUNT etc. from
// process.env. We override the module with a mutable fake whose values the
// individual tests can tweak via `setEnvOverrides()`.
const envOverrides: Record<string, number> = {
  MAX_BUNDLE_SIZE: 1024, // 1KB
  MAX_FILE_COUNT: 5,
  MAX_SINGLE_FILE_SIZE: 1024 * 1024, // 1MB
  CACHE_TTL_MS: 1_800_000,
  CACHE_MAX_ENTRIES: 50,
};

function setEnvOverrides(patch: Partial<typeof envOverrides>): void {
  Object.assign(envOverrides, patch);
}

vi.mock("@/config/env", () => {
  return {
    getEnv: () => ({
      STORAGE_TYPE: "local",
      STORAGE_LOCAL_PATH: "/tmp/not-used-in-tests",
      ...envOverrides,
    }),
    resetEnv: () => {},
  };
});

// ---------------------------------------------------------------------------
// storage mock
// ---------------------------------------------------------------------------
// extractBundle() calls getStorageAdapter().getBundleInfo() and getBundleStream().
// We replace those with test doubles backed by a Map<string, Buffer>.
const fakeBundles = new Map<string, Buffer>();

function setFakeBundle(storageKey: string, buffer: Buffer): void {
  fakeBundles.set(storageKey, buffer);
}

function clearFakeBundles(): void {
  fakeBundles.clear();
}

vi.mock("@/lib/storage", () => {
  return {
    getStorageAdapter: () => ({
      async getBundleInfo(key: string) {
        const buf = fakeBundles.get(key);
        if (!buf) return { exists: false };
        return {
          exists: true,
          size: buf.length,
          etag: `fake-${buf.length}`,
          lastModified: new Date(),
        };
      },
      async getBundleStream(key: string) {
        const buf = fakeBundles.get(key);
        if (!buf) throw new Error(`No fake bundle for ${key}`);
        const node = Readable.from(buf);
        // extractor uses Readable.fromWeb, which requires a Web ReadableStream.
        // Node 18+ provides Readable.toWeb for the reverse direction.
        return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
      },
    }),
  };
});

// ---------------------------------------------------------------------------
// imports under test (must come AFTER the vi.mock calls above)
// ---------------------------------------------------------------------------
import { extractBundle, validateBundleZip } from "./extractor";
import {
  FileCountLimitError,
  BundleSizeLimitError,
  ManifestNotFoundError,
  ManifestValidationError,
  IndexFileNotFoundError,
} from "./types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
interface ZipEntry {
  name: string;
  content: string | Buffer;
}

async function buildZipBuffer(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    sink.on("error", reject);
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.pipe(sink);
    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }
    archive.finalize().catch(reject);
  });
}

async function writeTempZip(entries: ZipEntry[]): Promise<string> {
  const buf = await buildZipBuffer(entries);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "extractor-test-"));
  const zipPath = path.join(dir, "bundle.zip");
  await fs.promises.writeFile(zipPath, buf);
  return zipPath;
}

const tempPaths: string[] = [];

afterEach(async () => {
  clearFakeBundles();
  // Reset env overrides between tests so one test's tweaks don't leak.
  setEnvOverrides({
    MAX_BUNDLE_SIZE: 1024,
    MAX_FILE_COUNT: 5,
    MAX_SINGLE_FILE_SIZE: 1024 * 1024,
  });
});

afterAll(async () => {
  for (const p of tempPaths) {
    await fs.promises.rm(path.dirname(p), { recursive: true, force: true }).catch(() => {});
  }
});

async function tempZip(entries: ZipEntry[]): Promise<string> {
  const p = await writeTempZip(entries);
  tempPaths.push(p);
  return p;
}

const VALID_MANIFEST = JSON.stringify({
  version: 1,
  title: "Test Bundle",
  index: "index.md",
});

// ===========================================================================
// validateBundleZip (upload-time manifest validation, no extraction)
// ===========================================================================
describe("validateBundleZip", () => {
  it("accepts a zip with a valid manifest and matching index file", async () => {
    const zipPath = await tempZip([
      { name: "manifest.json", content: VALID_MANIFEST },
      { name: "index.md", content: "# Hello" },
    ]);

    const result = await validateBundleZip(zipPath);
    expect(result.title).toBe("Test Bundle");
  });

  it("throws ManifestNotFoundError when manifest.json is missing (AC-22)", async () => {
    const zipPath = await tempZip([
      { name: "index.md", content: "# Hello" },
      { name: "other.txt", content: "nothing" },
    ]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(
      ManifestNotFoundError
    );
  });

  it("throws ManifestValidationError when manifest.json is not valid JSON (AC-22)", async () => {
    const zipPath = await tempZip([
      { name: "manifest.json", content: "{not valid json" },
      { name: "index.md", content: "# Hello" },
    ]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(
      ManifestValidationError
    );
  });

  it("throws ManifestValidationError when manifest is missing required fields (AC-22)", async () => {
    const zipPath = await tempZip([
      { name: "manifest.json", content: JSON.stringify({ version: 1 }) },
      { name: "index.md", content: "# Hello" },
    ]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(
      ManifestValidationError
    );
  });

  it("throws IndexFileNotFoundError when the referenced index file is absent (AC-23)", async () => {
    const zipPath = await tempZip([
      { name: "manifest.json", content: VALID_MANIFEST },
      { name: "other.md", content: "# Not the index" },
    ]);

    await expect(validateBundleZip(zipPath)).rejects.toBeInstanceOf(
      IndexFileNotFoundError
    );
  });
});

// ===========================================================================
// extractBundle limits
// ===========================================================================
describe("extractBundle — size and file-count limits", () => {
  const storageKey = "test-ws/limit-test";

  beforeEach(() => {
    clearFakeBundles();
  });

  it("throws BundleSizeLimitError when the stored zip exceeds MAX_BUNDLE_SIZE (AC-15 / AC-77)", async () => {
    setEnvOverrides({ MAX_BUNDLE_SIZE: 200 });

    // Build a zip that will definitely exceed 200 bytes thanks to the
    // manifest + a file containing 2KB of payload.
    const big = "x".repeat(2048);
    const buf = await buildZipBuffer([
      { name: "manifest.json", content: VALID_MANIFEST },
      { name: "index.md", content: "# Hello" },
      { name: "big.txt", content: big },
    ]);
    expect(buf.length).toBeGreaterThan(200);
    setFakeBundle(storageKey, buf);

    await expect(extractBundle(storageKey)).rejects.toBeInstanceOf(
      BundleSizeLimitError
    );
  });

  it("throws FileCountLimitError when the zip contains more than MAX_FILE_COUNT entries (AC-77)", async () => {
    setEnvOverrides({
      MAX_BUNDLE_SIZE: 10 * 1024 * 1024, // give it headroom so the size check doesn't fire first
      MAX_FILE_COUNT: 3,
    });

    // 1 manifest + 1 index + 5 extra = 7 entries, exceeds the limit of 3.
    const entries: ZipEntry[] = [
      { name: "manifest.json", content: VALID_MANIFEST },
      { name: "index.md", content: "# Hello" },
    ];
    for (let i = 0; i < 5; i++) {
      entries.push({ name: `extra-${i}.txt`, content: `file ${i}` });
    }
    const buf = await buildZipBuffer(entries);
    setFakeBundle(storageKey, buf);

    await expect(extractBundle(storageKey)).rejects.toBeInstanceOf(
      FileCountLimitError
    );
  });

  it("succeeds when the zip is within both limits", async () => {
    setEnvOverrides({
      MAX_BUNDLE_SIZE: 10 * 1024 * 1024,
      MAX_FILE_COUNT: 10,
    });

    const buf = await buildZipBuffer([
      { name: "manifest.json", content: VALID_MANIFEST },
      { name: "index.md", content: "# Hello" },
      { name: "logs/app.log", content: "ok" },
    ]);
    setFakeBundle(storageKey, buf);

    const entry = await extractBundle(storageKey);
    expect(entry.manifest.title).toBe("Test Bundle");
    expect(entry.fileTree.length).toBeGreaterThan(0);

    // Clean up the cache dir the extractor created so we don't leak into tmp.
    await fs.promises.rm(entry.cacheDir, { recursive: true, force: true }).catch(() => {});
  });
});
