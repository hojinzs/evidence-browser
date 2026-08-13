import { afterEach, describe, expect, it } from "vitest";
import { resetEnv } from "@/config/env";
import {
  createUploadToken,
  DEFAULT_UPLOAD_URL_TTL_SECONDS,
  MAX_UPLOAD_URL_TTL_SECONDS,
  verifyUploadToken,
} from "./upload-token";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
  resetEnv();
}

function tamperPayload(token: string, patch: Record<string, unknown>): string {
  const [prefix, encodedPayload, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>;
  const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, ...patch }), "utf8").toString("base64url");
  return `${prefix}.${tamperedPayload}.${signature}`;
}

function tamperSignature(token: string): string {
  const index = token.length - 1;
  return `${token.slice(0, index)}${token[index] === "A" ? "B" : "A"}`;
}

describe("upload token", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("round-trips a signed upload token with default TTL", () => {
    process.env.AUTH_SECRET = "upload-token-test-secret";
    resetEnv();
    const now = new Date("2026-08-13T10:00:00.000Z");

    const created = createUploadToken({
      workspace: "infra",
      bundleId: "run-42",
      issuerUserId: "user-1",
      now,
    });

    expect(created.expiresAt.toISOString()).toBe("2026-08-13T10:10:00.000Z");
    expect(created.payload).toEqual({
      v: 1,
      ws: "infra",
      b: "run-42",
      uid: "user-1",
      exp: Math.floor(now.getTime() / 1000) + DEFAULT_UPLOAD_URL_TTL_SECONDS,
    });
    expect(verifyUploadToken(created.token, now)).toEqual({ ok: true, payload: created.payload });
  });

  it("caps TTL at one hour", () => {
    process.env.AUTH_SECRET = "upload-token-test-secret";
    resetEnv();
    const now = new Date("2026-08-13T10:00:00.000Z");

    const created = createUploadToken({
      workspace: "infra",
      issuerUserId: "user-1",
      ttlSeconds: MAX_UPLOAD_URL_TTL_SECONDS + 60,
      now,
    });

    expect(created.expiresAt.toISOString()).toBe("2026-08-13T11:00:00.000Z");
  });

  it("rejects expired tokens", () => {
    process.env.AUTH_SECRET = "upload-token-test-secret";
    resetEnv();
    const created = createUploadToken({
      workspace: "infra",
      issuerUserId: "user-1",
      ttlSeconds: 60,
      now: new Date("2026-08-13T10:00:00.000Z"),
    });

    expect(verifyUploadToken(created.token, new Date("2026-08-13T10:01:00.000Z"))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects payload tampering", () => {
    process.env.AUTH_SECRET = "upload-token-test-secret";
    resetEnv();
    const created = createUploadToken({
      workspace: "infra",
      issuerUserId: "user-1",
      now: new Date("2026-08-13T10:00:00.000Z"),
    });

    expect(verifyUploadToken(tamperPayload(created.token, { ws: "other" }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects signature tampering", () => {
    process.env.AUTH_SECRET = "upload-token-test-secret";
    resetEnv();
    const created = createUploadToken({
      workspace: "infra",
      issuerUserId: "user-1",
      now: new Date("2026-08-13T10:00:00.000Z"),
    });

    expect(verifyUploadToken(tamperSignature(created.token))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
