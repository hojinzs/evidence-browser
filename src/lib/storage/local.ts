import fs from "fs";
import { Readable } from "stream";
import path from "path";
import type { BundleInfo, StorageAdapter } from "./types";

async function walkDir(dir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export class LocalFSAdapter implements StorageAdapter {
  constructor(private basePath: string) {}

  async getBundleInfo(bundleId: string): Promise<BundleInfo> {
    const zipPath = this.resolvePath(bundleId);
    try {
      const stat = await fs.promises.stat(zipPath);
      return {
        exists: true,
        size: stat.size,
        etag: `${stat.mtimeMs}-${stat.size}`,
        lastModified: stat.mtime,
      };
    } catch {
      return { exists: false };
    }
  }

  async getBundleStream(bundleId: string): Promise<ReadableStream<Uint8Array>> {
    const zipPath = this.resolvePath(bundleId);
    const nodeStream = fs.createReadStream(zipPath);
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async listBundles(prefix?: string): Promise<string[]> {
    let allFiles: string[];
    try {
      allFiles = await walkDir(this.basePath);
    } catch {
      return [];
    }
    return allFiles
      .filter((f) => f.endsWith(".zip"))
      .map((f) => {
        const rel = path.relative(this.basePath, f);
        return rel.slice(0, -4); // strip .zip
      })
      .filter((id) => !prefix || id.startsWith(prefix));
  }

  async putBundle(storageKey: string, data: Buffer): Promise<void> {
    const zipPath = this.resolvePath(storageKey);
    await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
    await fs.promises.writeFile(zipPath, data);
  }

  private resolvePath(storageKey: string): string {
    return path.join(this.basePath, `${storageKey}.zip`);
  }
}
