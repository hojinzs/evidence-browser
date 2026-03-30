import { z } from "zod/v4";

const booleanFromString = z
  .string()
  .optional()
  .default("false")
  .transform((v) => v === "true");

const numberFromString = (defaultVal: number) =>
  z
    .string()
    .optional()
    .default(String(defaultVal))
    .transform((v) => Number(v))
    .refine((n) => !isNaN(n), "Must be a valid number");

const envSchema = z
  .object({
    // Storage
    STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().optional(),

    // S3
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional().default("auto"),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: booleanFromString,

    // Auth
    AUTH_BYPASS: booleanFromString,
    OIDC_ISSUER: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
    OIDC_PROVIDER_NAME: z.string().optional().default("OIDC"),
    NEXTAUTH_URL: z.string().optional().default("http://localhost:3000"),
    NEXTAUTH_SECRET: z.string().optional(),
    AUTH_SECRET: z.string().optional(),

    // Cache
    CACHE_TTL_MS: numberFromString(1_800_000),
    CACHE_MAX_ENTRIES: numberFromString(50),

    // Limits
    MAX_BUNDLE_SIZE: numberFromString(500 * 1024 * 1024),
    MAX_FILE_COUNT: numberFromString(10_000),
    MAX_SINGLE_FILE_SIZE: numberFromString(100 * 1024 * 1024),
  })
  .refine(
    (data) => {
      if (data.STORAGE_TYPE === "local") {
        return !!data.STORAGE_LOCAL_PATH;
      }
      return true;
    },
    {
      message: "STORAGE_LOCAL_PATH is required when STORAGE_TYPE=local",
      path: ["STORAGE_LOCAL_PATH"],
    }
  )
  .refine(
    (data) => {
      if (data.STORAGE_TYPE === "s3") {
        return !!data.S3_BUCKET;
      }
      return true;
    },
    {
      message: "S3_BUCKET is required when STORAGE_TYPE=s3",
      path: ["S3_BUCKET"],
    }
  )
  .refine(
    (data) => {
      if (data.STORAGE_TYPE === "s3") {
        return !!data.S3_ACCESS_KEY_ID && !!data.S3_SECRET_ACCESS_KEY;
      }
      return true;
    },
    {
      message:
        "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_TYPE=s3",
      path: ["S3_ACCESS_KEY_ID"],
    }
  )
  .refine(
    (data) => {
      if (!data.AUTH_BYPASS) {
        return !!data.OIDC_ISSUER && !!data.OIDC_CLIENT_ID && !!data.OIDC_CLIENT_SECRET;
      }
      return true;
    },
    {
      message:
        "OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET are required when AUTH_BYPASS is not true",
      path: ["OIDC_ISSUER"],
    }
  )
  .refine(
    (data) => {
      if (!data.AUTH_BYPASS) {
        return !!(data.NEXTAUTH_SECRET || data.AUTH_SECRET);
      }
      return true;
    },
    {
      message:
        "NEXTAUTH_SECRET or AUTH_SECRET is required when AUTH_BYPASS is not true",
      path: ["NEXTAUTH_SECRET"],
    }
  );

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Environment variable validation failed:\n${formatted}`
    );
  }
  _env = result.data;
  return _env;
}

export { envSchema };
