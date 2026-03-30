import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import type { BundleInfo, StorageAdapter } from "./types";

interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3Adapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region || "auto",
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async getBundleInfo(bundleId: string): Promise<BundleInfo> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: `${bundleId}.zip`,
        })
      );
      return {
        exists: true,
        size: result.ContentLength,
        etag: result.ETag,
        lastModified: result.LastModified,
      };
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        (err.name === "NotFound" || err.name === "NoSuchKey")
      ) {
        return { exists: false };
      }
      throw err;
    }
  }

  async getBundleStream(bundleId: string): Promise<ReadableStream<Uint8Array>> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: `${bundleId}.zip`,
      })
    );

    if (!result.Body) {
      throw new Error(`Empty body for bundle: ${bundleId}`);
    }

    // AWS SDK returns a Readable (Node stream) in Node.js environment
    const body = result.Body as Readable;
    return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  }
}
