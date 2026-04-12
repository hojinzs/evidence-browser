import { getEnv } from "@/config/env";
import { LocalFSAdapter } from "./local";
import { S3Adapter } from "./s3";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, BundleInfo } from "./types";

export function createStorageAdapter(): StorageAdapter {
  const env = getEnv();

  switch (env.STORAGE_TYPE) {
    case "local":
      return new LocalFSAdapter(env.STORAGE_LOCAL_PATH!);
    case "s3":
      return new S3Adapter({
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });
    default:
      throw new Error(`Unknown storage type: ${env.STORAGE_TYPE}`);
  }
}

let _adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!_adapter) _adapter = createStorageAdapter();
  return _adapter;
}
