import { createHmac } from "crypto";
import { getEnv } from "@/config/env";
import { timingSafeStringEqual } from "@/lib/crypto";

export const UPLOAD_TOKEN_PREFIX = "ebu1";
export const DEFAULT_UPLOAD_URL_TTL_SECONDS = 600;
export const MAX_UPLOAD_URL_TTL_SECONDS = 3600;

export type CreateUploadTokenInput = {
  workspace: string;
  bundleId?: string;
  issuerUserId: string;
  ttlSeconds?: number;
  now?: Date;
};

export type UploadTokenPayload = {
  v: 1;
  ws: string;
  b?: string;
  uid: string;
  exp: number;
};

export type CreateUploadTokenResult = {
  token: string;
  expiresAt: Date;
  payload: UploadTokenPayload;
};

export type VerifyUploadTokenResult =
  | { ok: true; payload: UploadTokenPayload }
  | { ok: false; reason: "malformed" | "invalid" | "expired" };

function getAuthSecret(): string {
  return getEnv().AUTH_SECRET;
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64urlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getAuthSecret()).update(encodedPayload).digest("base64url");
}

function normalizeTtl(ttlSeconds: number | undefined): number {
  if (ttlSeconds === undefined) return DEFAULT_UPLOAD_URL_TTL_SECONDS;
  return Math.min(ttlSeconds, MAX_UPLOAD_URL_TTL_SECONDS);
}

function isUploadTokenPayload(value: unknown): value is UploadTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<UploadTokenPayload>;
  return (
    payload.v === 1 &&
    typeof payload.ws === "string" &&
    payload.ws.length > 0 &&
    (payload.b === undefined || (typeof payload.b === "string" && payload.b.length > 0)) &&
    typeof payload.uid === "string" &&
    payload.uid.length > 0 &&
    typeof payload.exp === "number" &&
    Number.isInteger(payload.exp)
  );
}

export function createUploadToken(input: CreateUploadTokenInput): CreateUploadTokenResult {
  const now = input.now ?? new Date();
  const ttlSeconds = normalizeTtl(input.ttlSeconds);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const payload: UploadTokenPayload = {
    v: 1,
    ws: input.workspace,
    uid: input.issuerUserId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };

  if (input.bundleId) payload.b = input.bundleId;

  const encodedPayload = base64urlJson(payload);
  const signature = signPayload(encodedPayload);

  return {
    token: `${UPLOAD_TOKEN_PREFIX}.${encodedPayload}.${signature}`,
    expiresAt,
    payload,
  };
}

export function verifyUploadToken(token: string, now = new Date()): VerifyUploadTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== UPLOAD_TOKEN_PREFIX) {
    return { ok: false, reason: "malformed" };
  }

  const [, encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return { ok: false, reason: "malformed" };

  const expectedSignature = signPayload(encodedPayload);
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    return { ok: false, reason: "invalid" };
  }

  let decoded: unknown;
  try {
    decoded = decodeBase64urlJson(encodedPayload);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!isUploadTokenPayload(decoded)) {
    return { ok: false, reason: "malformed" };
  }

  if (decoded.exp <= Math.floor(now.getTime() / 1000)) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload: decoded };
}
