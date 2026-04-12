export interface BundleInfo {
  exists: boolean;
  size?: number;
  etag?: string;
  lastModified?: Date;
}

export interface StorageAdapter {
  getBundleInfo(storageKey: string): Promise<BundleInfo>;
  getBundleStream(storageKey: string): Promise<ReadableStream<Uint8Array>>;
  listBundles?(prefix?: string): Promise<string[]>;
  putBundle?(storageKey: string, data: Buffer): Promise<void>;
}
