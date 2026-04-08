import { describe, it, expect } from "vitest";
import { envSchema } from "./env";

describe("envSchema", () => {
  const validLocalEnv = {
    STORAGE_TYPE: "local",
    STORAGE_LOCAL_PATH: "./data/bundles",
  };

  const validS3Env = {
    STORAGE_TYPE: "s3",
    S3_BUCKET: "my-bucket",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
  };

  it("parses valid local config", () => {
    const result = envSchema.safeParse(validLocalEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.STORAGE_TYPE).toBe("local");
      expect(result.data.STORAGE_LOCAL_PATH).toBe("./data/bundles");
    }
  });

  it("parses valid S3 config", () => {
    const result = envSchema.safeParse(validS3Env);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.STORAGE_TYPE).toBe("s3");
      expect(result.data.S3_BUCKET).toBe("my-bucket");
    }
  });

  it("fails when STORAGE_LOCAL_PATH missing for local type", () => {
    const result = envSchema.safeParse({
      STORAGE_TYPE: "local",
    });
    expect(result.success).toBe(false);
  });

  it("fails when S3_BUCKET missing for s3 type", () => {
    const result = envSchema.safeParse({
      STORAGE_TYPE: "s3",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("applies default values", () => {
    const result = envSchema.safeParse(validLocalEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATA_DIR).toBe("./data");
      expect(result.data.CACHE_TTL_MS).toBe(1_800_000);
      expect(result.data.CACHE_MAX_ENTRIES).toBe(50);
      expect(result.data.MAX_BUNDLE_SIZE).toBe(500 * 1024 * 1024);
      expect(result.data.MAX_FILE_COUNT).toBe(10_000);
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(false);
      expect(result.data.AUTH_SECRET).toBeDefined();
    }
  });

  it("parses S3_FORCE_PATH_STYLE=true", () => {
    const result = envSchema.safeParse({
      ...validS3Env,
      S3_FORCE_PATH_STYLE: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(true);
    }
  });

  it("accepts custom DATA_DIR", () => {
    const result = envSchema.safeParse({
      ...validLocalEnv,
      DATA_DIR: "/custom/data",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATA_DIR).toBe("/custom/data");
    }
  });

  it("accepts custom AUTH_SECRET", () => {
    const result = envSchema.safeParse({
      ...validLocalEnv,
      AUTH_SECRET: "my-secret-key",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.AUTH_SECRET).toBe("my-secret-key");
    }
  });
});
