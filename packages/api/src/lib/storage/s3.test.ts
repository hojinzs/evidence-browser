import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "stream";
import { afterEach, describe, expect, it } from "vitest";
import { S3Adapter } from "./s3";

const s3Mock = mockClient(S3Client);

function createAdapter(): S3Adapter {
  return new S3Adapter({
    bucket: "test-bucket",
    region: "us-east-1",
    endpoint: "https://s3.example.test",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    forcePathStyle: true,
  });
}

async function readWebStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

afterEach(() => {
  s3Mock.reset();
});

describe("S3Adapter", () => {
  it("reads bundle metadata with HeadObjectCommand", async () => {
    const lastModified = new Date("2026-07-06T12:00:00Z");
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 1234,
      ETag: '"etag-value"',
      LastModified: lastModified,
    });
    const adapter = createAdapter();

    await expect(adapter.getBundleInfo("workspace/bundle")).resolves.toEqual({
      exists: true,
      size: 1234,
      etag: '"etag-value"',
      lastModified,
    });

    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(HeadObjectCommand)[0].args[0].input).toEqual({
      Bucket: "test-bucket",
      Key: "workspace/bundle.zip",
    });
  });

  it.each(["NotFound", "NoSuchKey"])(
    "maps %s from HeadObjectCommand to a missing bundle",
    async (name) => {
      const error = Object.assign(new Error(name), { name });
      s3Mock.on(HeadObjectCommand).rejects(error);
      const adapter = createAdapter();

      await expect(adapter.getBundleInfo("missing/bundle")).resolves.toEqual({
        exists: false,
      });
    }
  );

  it("converts an S3 object body Node stream to a Web stream", async () => {
    const body = Readable.from([Buffer.from("zip-content")]) as unknown as GetObjectCommandOutput["Body"];
    s3Mock.on(GetObjectCommand).resolves({
      Body: body,
    });
    const adapter = createAdapter();

    const stream = await adapter.getBundleStream("workspace/bundle");

    await expect(readWebStream(stream)).resolves.toBe("zip-content");
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(GetObjectCommand)[0].args[0].input).toEqual({
      Bucket: "test-bucket",
      Key: "workspace/bundle.zip",
    });
  });

  it("throws when S3 returns an object without a body", async () => {
    s3Mock.on(GetObjectCommand).resolves({});
    const adapter = createAdapter();

    await expect(adapter.getBundleStream("workspace/empty")).rejects.toThrow(
      "Empty body for bundle: workspace/empty"
    );
  });

  it("lists only zip bundle keys and strips the suffix", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: "workspace/alpha.zip" },
        { Key: "workspace/readme.txt" },
        { Key: "workspace/nested/beta.zip" },
        {},
      ],
      IsTruncated: false,
    });
    const adapter = createAdapter();

    await expect(adapter.listBundles("workspace/")).resolves.toEqual([
      "workspace/alpha",
      "workspace/nested/beta",
    ]);

    expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(1);
    expect(s3Mock.commandCalls(ListObjectsV2Command)[0].args[0].input).toEqual({
      Bucket: "test-bucket",
      Prefix: "workspace/",
      ContinuationToken: undefined,
    });
  });

  it("continues listing bundles with the next continuation token", async () => {
    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({
        Contents: [{ Key: "workspace/first.zip" }],
        IsTruncated: true,
        NextContinuationToken: "page-2",
      })
      .resolvesOnce({
        Contents: [{ Key: "workspace/second.zip" }],
        IsTruncated: false,
      });
    const adapter = createAdapter();

    await expect(adapter.listBundles("workspace/")).resolves.toEqual([
      "workspace/first",
      "workspace/second",
    ]);

    expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(2);
    expect(s3Mock.commandCalls(ListObjectsV2Command)[0].args[0].input).toEqual({
      Bucket: "test-bucket",
      Prefix: "workspace/",
      ContinuationToken: undefined,
    });
    expect(s3Mock.commandCalls(ListObjectsV2Command)[1].args[0].input).toEqual({
      Bucket: "test-bucket",
      Prefix: "workspace/",
      ContinuationToken: "page-2",
    });
  });

  it("uploads bundle data with PutObjectCommand", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const adapter = createAdapter();
    const data = Buffer.from("zip-content");

    await expect(adapter.putBundle("workspace/bundle", data)).resolves.toBeUndefined();

    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(PutObjectCommand)[0].args[0].input).toEqual({
      Bucket: "test-bucket",
      Key: "workspace/bundle.zip",
      Body: data,
      ContentType: "application/zip",
    });
  });

  it("deletes bundles with DeleteObjectCommand", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    const adapter = createAdapter();

    await expect(adapter.deleteBundle("workspace/bundle")).resolves.toBeUndefined();

    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({
      Bucket: "test-bucket",
      Key: "workspace/bundle.zip",
    });
  });
});
