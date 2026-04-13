import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as yauzl from "yauzl-promise";
import { validateBundleZip } from "@evidence-browser/shared/bundle/validate-zip";
import { getStorageAdapter } from "@/lib/storage";
import { getEnv } from "@/config/env";
import { parseManifest } from "./manifest";
import { validatePathSafety, ensureWithinRoot } from "./security";
import type { CacheEntry, TreeNode } from "./types";
import {
  BundleNotFoundError,
  BundleSizeLimitError,
  FileCountLimitError,
} from "./types";

const CACHE_BASE = path.join(os.tmpdir(), "evidence-bundles");
const cache = new Map<string, CacheEntry>();

function computeCacheKey(bundleId: string, etag?: string): string {
  return crypto
    .createHash("sha256")
    .update(`${bundleId}:${etag ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

function isExpired(entry: CacheEntry): boolean {
  const env = getEnv();
  return Date.now() - entry.lastAccessed > env.CACHE_TTL_MS;
}

function evictExpired(): void {
  for (const [key, entry] of cache) {
    if (isExpired(entry)) {
      cache.delete(key);
      fs.promises.rm(entry.cacheDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const env = getEnv();
  if (cache.size > env.CACHE_MAX_ENTRIES) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const toEvict = sorted.slice(0, cache.size - env.CACHE_MAX_ENTRIES);
    for (const [key, entry] of toEvict) {
      cache.delete(key);
      fs.promises.rm(entry.cacheDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function extractBundle(bundleId: string): Promise<CacheEntry> {
  const storage = getStorageAdapter();
  const env = getEnv();
  const info = await storage.getBundleInfo(bundleId);

  if (!info.exists) throw new BundleNotFoundError(bundleId);
  if (info.size && info.size > env.MAX_BUNDLE_SIZE) {
    throw new BundleSizeLimitError(info.size, env.MAX_BUNDLE_SIZE);
  }

  const cacheKey = computeCacheKey(bundleId, info.etag);
  const existing = cache.get(cacheKey);
  if (existing && !isExpired(existing)) {
    existing.lastAccessed = Date.now();
    return existing;
  }

  evictExpired();

  const cacheDir = path.join(CACHE_BASE, cacheKey);
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const stream = await storage.getBundleStream(bundleId);
  const tmpZip = path.join(cacheDir, "__bundle.zip");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeStream = Readable.fromWeb(stream as any);
  await pipeline(nodeStream, fs.createWriteStream(tmpZip));

  let fileCount = 0;
  const zipFile = await yauzl.open(tmpZip);
  try {
    for await (const entry of zipFile) {
      if (entry.filename.endsWith("/")) continue;
      if (!validatePathSafety(entry.filename)) continue;

      const targetPath = path.join(cacheDir, entry.filename);
      if (!ensureWithinRoot(cacheDir, targetPath)) continue;

      fileCount++;
      if (fileCount > env.MAX_FILE_COUNT) {
        throw new FileCountLimitError(fileCount, env.MAX_FILE_COUNT);
      }

      if (entry.uncompressedSize > env.MAX_SINGLE_FILE_SIZE) continue;

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      const readStream = await entry.openReadStream();
      await pipeline(readStream, fs.createWriteStream(targetPath));
    }
  } finally {
    await zipFile.close();
  }

  await fs.promises.unlink(tmpZip).catch(() => {});

  const manifest = await parseManifest(cacheDir);
  const rawTree = await buildFileTree(cacheDir);
  const fileTree = setTreePaths(rawTree);

  const cacheEntry: CacheEntry = {
    cacheDir,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    manifest,
    fileTree,
  };
  cache.set(cacheKey, cacheEntry);
  return cacheEntry;
}

export async function buildFileTree(dir: string): Promise<TreeNode[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "__bundle.zip") continue;
    if (entry.isDirectory()) {
      const children = await buildFileTree(path.join(dir, entry.name));
      nodes.push({ name: entry.name, type: "directory", path: "", children });
    } else {
      nodes.push({ name: entry.name, type: "file", path: "" });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export function setTreePaths(nodes: TreeNode[], prefix = ""): TreeNode[] {
  return nodes.map((node) => {
    const nodePath = prefix ? `${prefix}/${node.name}` : node.name;
    return {
      ...node,
      path: nodePath,
      children: node.children ? setTreePaths(node.children, nodePath) : undefined,
    };
  });
}

export async function getFileContent(cacheDir: string, filePath: string): Promise<Buffer> {
  const fullPath = path.join(cacheDir, filePath);
  if (!validatePathSafety(filePath) || !ensureWithinRoot(cacheDir, fullPath)) {
    throw new Error("Invalid file path");
  }
  return fs.promises.readFile(fullPath);
}

export { validateBundleZip };
