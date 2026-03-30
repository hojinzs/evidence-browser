export interface BundleInfo {
  exists: boolean;
  size?: number;
  etag?: string;
  lastModified?: Date;
}

export interface StorageAdapter {
  getBundleInfo(bundleId: string): Promise<BundleInfo>;
  getBundleStream(bundleId: string): Promise<ReadableStream<Uint8Array>>;
}
