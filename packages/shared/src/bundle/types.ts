export interface Manifest {
  version: number;
  title: string;
  index: string;
  [key: string]: unknown;
}

export interface TreeNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: TreeNode[];
}

export interface CacheEntry {
  cacheDir: string;
  createdAt: number;
  lastAccessed: number;
  manifest: Manifest;
  fileTree: TreeNode[];
}

export class BundleNotFoundError extends Error {
  constructor(bundleId: string) {
    super(`Bundle not found: ${bundleId}`);
    this.name = "BundleNotFoundError";
  }
}

export class BundleSizeLimitError extends Error {
  constructor(size: number, limit: number) {
    super(
      `Bundle size (${(size / 1024 / 1024).toFixed(1)}MB) exceeds limit (${(limit / 1024 / 1024).toFixed(1)}MB)`
    );
    this.name = "BundleSizeLimitError";
  }
}

export class FileCountLimitError extends Error {
  constructor(count: number, limit: number) {
    super(`File count (${count}) exceeds limit (${limit})`);
    this.name = "FileCountLimitError";
  }
}

export class ManifestNotFoundError extends Error {
  constructor() {
    super("manifest.json을 찾을 수 없습니다");
    this.name = "ManifestNotFoundError";
  }
}

export class ManifestValidationError extends Error {
  constructor(details: string) {
    super(`manifest.json 검증 실패: ${details}`);
    this.name = "ManifestValidationError";
  }
}

export class IndexFileNotFoundError extends Error {
  constructor(indexPath: string) {
    super(`${indexPath}를 찾을 수 없습니다`);
    this.name = "IndexFileNotFoundError";
  }
}
