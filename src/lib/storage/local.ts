import fs from "fs";
import { Readable } from "stream";
import path from "path";
import type { BundleInfo, StorageAdapter } from "./types";

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

  private resolvePath(bundleId: string): string {
    return path.join(this.basePath, `${bundleId}.zip`);
  }
}
