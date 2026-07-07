import { afterEach, describe, expect, it } from "vitest";
import { resetEnv } from "@/config/env";
import { createStorageAdapter } from "./index";
import { LocalFSAdapter } from "./local";
import { S3Adapter } from "./s3";

const STORAGE_ENV_KEYS = [
  "STORAGE_TYPE",
  "STORAGE_LOCAL_PATH",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
] as const;

const originalEnv = Object.fromEntries(
  STORAGE_ENV_KEYS.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of STORAGE_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnv();
});

describe("createStorageAdapter", () => {
  it("creates a local filesystem adapter when STORAGE_TYPE is local", () => {
    process.env.STORAGE_TYPE = "local";
    process.env.STORAGE_LOCAL_PATH = "/tmp/evidence-browser-test-bundles";
    resetEnv();

    expect(createStorageAdapter()).toBeInstanceOf(LocalFSAdapter);
  });

  it("creates an S3 adapter when STORAGE_TYPE is s3", () => {
    process.env.STORAGE_TYPE = "s3";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://s3.example.test";
    process.env.S3_ACCESS_KEY_ID = "test-access-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.S3_FORCE_PATH_STYLE = "true";
    resetEnv();

    expect(createStorageAdapter()).toBeInstanceOf(S3Adapter);
  });
});
