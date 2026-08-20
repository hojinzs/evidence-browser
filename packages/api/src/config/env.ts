import { z } from "zod/v4";

const booleanFromString = z
  .string()
  .optional()
  .default("false")
  .transform((v) => v === "true");

const booleanFromStringWithDefault = (defaultVal: boolean) =>
  z
    .string()
    .optional()
    .default(String(defaultVal))
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
    // Server
    PORT: numberFromString(3000),
    HOSTNAME: z.string().optional().default("0.0.0.0"),

    // Data directory (SQLite DB location)
    DATA_DIR: z.string().optional().default("./data"),

    // Storage
    STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().optional().default("./data/bundles"),

    // S3
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional().default("auto"),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: booleanFromString,

    // MCP
    MCP_API_KEY: z.string().optional(),

    // Static SPA
    STATIC_ROOT: z.string().optional(),
    PUBLIC_URL: z.string().url().optional(),

    // Auth
    AUTH_SECRET: z.string().optional().default("evidence-browser-default-secret-change-me"),
    AUTH_BYPASS: booleanFromString,
    AUTH_LOCAL_ENABLED: booleanFromStringWithDefault(true),

    // OIDC
    OIDC_ENABLED: booleanFromString,
    OIDC_ISSUER: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
    OIDC_REDIRECT_URI: z.string().optional(),
    OIDC_SCOPES: z.string().optional().default("openid profile email"),
    OIDC_GROUPS_CLAIM: z.string().optional().default("groups"),
    OIDC_ADMIN_GROUP: z.string().optional(),
    OIDC_ALLOWED_GROUPS: z.string().optional(),
    OIDC_AUTO_PROVISION: booleanFromStringWithDefault(true),
    OIDC_LINK_BY_VERIFIED_EMAIL: booleanFromString,
    OIDC_BUTTON_LABEL: z.string().optional().default("Sign in with SSO"),

    NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),

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
      if (data.NODE_ENV === "production" && data.AUTH_SECRET === "evidence-browser-default-secret-change-me") {
        return false;
      }
      return true;
    },
    {
      message: "AUTH_SECRET must be explicitly set in production (do not use the default value)",
      path: ["AUTH_SECRET"],
    }
  )
  .refine(
    (data) => {
      if (data.OIDC_ENABLED) {
        return (
          !!data.OIDC_ISSUER &&
          !!data.OIDC_CLIENT_ID &&
          !!data.OIDC_CLIENT_SECRET &&
          !!data.OIDC_REDIRECT_URI
        );
      }
      return true;
    },
    {
      message:
        "OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_REDIRECT_URI are required when OIDC_ENABLED=true",
      path: ["OIDC_ISSUER"],
    }
  )
  .refine(
    (data) => {
      if (!data.AUTH_LOCAL_ENABLED) {
        return data.OIDC_ENABLED;
      }
      return true;
    },
    {
      message: "OIDC_ENABLED=true is required when AUTH_LOCAL_ENABLED=false",
      path: ["AUTH_LOCAL_ENABLED"],
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

/** Reset cached env (for testing) */
export function resetEnv(): void {
  _env = null;
}

export { envSchema };
