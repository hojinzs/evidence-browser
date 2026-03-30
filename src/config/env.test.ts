import { describe, it, expect } from "vitest";
import { envSchema } from "./env";

describe("envSchema", () => {
  const validLocalEnv = {
    STORAGE_TYPE: "local",
    STORAGE_LOCAL_PATH: "./data/bundles",
    AUTH_BYPASS: "true",
  };

  const validS3Env = {
    STORAGE_TYPE: "s3",
    S3_BUCKET: "my-bucket",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    AUTH_BYPASS: "true",
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
      AUTH_BYPASS: "true",
    });
    expect(result.success).toBe(false);
  });

  it("fails when S3_BUCKET missing for s3 type", () => {
    const result = envSchema.safeParse({
      STORAGE_TYPE: "s3",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      AUTH_BYPASS: "true",
    });
    expect(result.success).toBe(false);
  });

  it("allows missing OIDC vars when AUTH_BYPASS=true", () => {
    const result = envSchema.safeParse(validLocalEnv);
    expect(result.success).toBe(true);
  });

  it("requires OIDC vars when AUTH_BYPASS=false", () => {
    const result = envSchema.safeParse({
      STORAGE_TYPE: "local",
      STORAGE_LOCAL_PATH: "./data/bundles",
      AUTH_BYPASS: "false",
    });
    expect(result.success).toBe(false);
  });

  it("applies default values", () => {
    const result = envSchema.safeParse(validLocalEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.CACHE_TTL_MS).toBe(1_800_000);
      expect(result.data.CACHE_MAX_ENTRIES).toBe(50);
      expect(result.data.MAX_BUNDLE_SIZE).toBe(500 * 1024 * 1024);
      expect(result.data.MAX_FILE_COUNT).toBe(10_000);
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(false);
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
});
