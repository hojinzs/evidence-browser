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

  async deleteBundle(storageKey: string): Promise<void> {
    const zipPath = this.resolvePath(storageKey);
    try {
      await fs.promises.unlink(zipPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      return;
    }

    await this.removeEmptyParents(path.dirname(zipPath));
  }

  private async removeEmptyParents(currentPath: string): Promise<void> {
    const base = path.resolve(this.basePath);

    while (currentPath.startsWith(base + path.sep)) {
      try {
        await fs.promises.rmdir(currentPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOTEMPTY" || code === "ENOENT") return;
        throw error;
      }

      currentPath = path.dirname(currentPath);
    }
  }

  private resolvePath(storageKey: string): string {
    const base = path.resolve(this.basePath);
    const resolved = path.resolve(base, `${storageKey}.zip`);
    if (!resolved.startsWith(base + path.sep)) {
      throw new Error("Invalid storage key: path traversal detected");
    }
    return resolved;
  }
}
