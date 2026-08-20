import { createSign, generateKeyPairSync } from "crypto";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { createApiKey } from "@/lib/db/api-keys";
import { createTestDb } from "@/lib/db/index";
import { findUserByUsername } from "@/lib/db/users";
import { authenticate, type AppVariables } from "@/middleware/auth";

let testDb: Database.Database;

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

import { resetOidcDiscoveryCache, signOidcTx, verifyOidcTx } from "@/lib/auth/oidc";
import { authRoutes } from "./auth";

const originalEnv = { ...process.env };
const issuer = "https://issuer.example.test";
const authorizationEndpoint = `${issuer}/authorize`;
const tokenEndpoint = `${issuer}/token`;
const jwksUri = `${issuer}/jwks`;
let tokenRequestBodies: string[] = [];

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
Object.assign(publicJwk, { kid: "test-key", alg: "RS256", use: "sig" });

type ClaimsOptions = {
  nonce?: string;
  groups?: string[];
  subject?: string;
  email?: string;
};

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signIdToken(options: ClaimsOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "RS256", typ: "JWT", kid: "test-key" });
  const payload = base64urlJson({
    iss: issuer,
    aud: "client-id",
    sub: options.subject ?? "subject-1",
    iat: now,
    exp: now + 300,
    nonce: options.nonce,
    preferred_username: "oidc-member",
    email: options.email ?? "oidc-member@example.com",
    email_verified: true,
    groups: options.groups ?? ["users"],
  });
  const input = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(input).sign(privateKey, "base64url");
  return `${input}.${signature}`;
}

function setOidcEnv(overrides: Record<string, string | undefined> = {}) {
  process.env.AUTH_SECRET = "test-secret";
  process.env.OIDC_ENABLED = "true";
  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_CLIENT_ID = "client-id";
  process.env.OIDC_CLIENT_SECRET = "client-secret";
  process.env.OIDC_REDIRECT_URI = "http://localhost/api/auth/oidc/callback";
  process.env.OIDC_AUTO_PROVISION = "true";
  process.env.OIDC_LINK_BY_VERIFIED_EMAIL = "false";
  process.env.OIDC_GROUPS_CLAIM = "groups";
  process.env.AUTH_LOCAL_ENABLED = "true";
  delete process.env.OIDC_ALLOWED_GROUPS;
  delete process.env.OIDC_ADMIN_GROUP;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnv();
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnv();
}

function createTestApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/api/auth", authRoutes);
  app.get("/read", authenticate, (c) =>
    c.json({
      user: c.get("user"),
      apiKeyScope: c.get("apiKeyScope") ?? null,
    })
  );
  return app;
}

function findSetCookie(headers: Headers, name: string): string {
  const cookies = (headers as unknown as { getSetCookie: () => string[] })
    .getSetCookie();
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Missing Set-Cookie for ${name}`);
  return cookie;
}

function cookieValue(setCookie: string): string {
  return decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("="));
}

function requestBodyText(input: string | URL | Request, init?: RequestInit): Promise<string> {
  if (input instanceof Request) {
    return input.clone().text();
  }
  const body = init?.body;
  if (!body) return Promise.resolve("");
  if (typeof body === "string") return Promise.resolve(body);
  if (body instanceof URLSearchParams) return Promise.resolve(body.toString());
  if (body instanceof FormData) {
    const params = new URLSearchParams();
    for (const [key, value] of body.entries()) {
      if (typeof value === "string") params.append(key, value);
    }
    return Promise.resolve(params.toString());
  }
  return Promise.resolve("");
}

function mockIssuerFetch(options: { nonce?: string; omitNonce?: boolean } = {}) {
  tokenRequestBodies = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      input instanceof Request ? input.url : input instanceof URL ? input.href : input;

    if (url === `${issuer}/.well-known/openid-configuration`) {
      return Response.json({
        issuer,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint,
        jwks_uri: jwksUri,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    }

    if (url === jwksUri) {
      return Response.json({ keys: [publicJwk] });
    }

    if (url === tokenEndpoint) {
      tokenRequestBodies.push(await requestBodyText(input, init));
      return Response.json({
        access_token: "access-token",
        token_type: "Bearer",
        expires_in: 300,
        id_token: signIdToken({
          nonce: options.omitNonce ? undefined : options.nonce,
        }),
      });
    }

    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("OIDC auth routes", () => {
  beforeEach(() => {
    testDb = createTestDb();
    setOidcEnv();
    resetOidcDiscoveryCache();
  });

  afterEach(() => {
    testDb.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetOidcDiscoveryCache();
    restoreEnv();
  });

  it("issues a session cookie and redirects to a safe relative callback URL", async () => {
    const app = createTestApp();
    mockIssuerFetch();

    const start = await app.request(
      "/api/auth/oidc/start?callbackUrl=%2Fw%2Fdefault%3Ftab%3Dfiles"
    );
    expect(start.status).toBe(302);
    const startLocation = start.headers.get("location");
    expect(startLocation).toContain(authorizationEndpoint);
    expect(startLocation).not.toContain("code_verifier");

    const tx = verifyOidcTx(cookieValue(findSetCookie(start.headers, "eb_oidc_tx")));
    expect(tx).toMatchObject({ callbackUrl: "/w/default?tab=files" });
    mockIssuerFetch({ nonce: tx?.nonce });

    const callback = await app.request(
      `/api/auth/oidc/callback?code=auth-code&state=${tx?.state}`,
      { headers: { cookie: `eb_oidc_tx=${encodeURIComponent(signOidcTx(tx!))}` } }
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/w/default?tab=files");
    expect(findSetCookie(callback.headers, SESSION_COOKIE_NAME)).toContain(
      `${SESSION_COOKIE_NAME}=`
    );
    expect(findSetCookie(callback.headers, "eb_oidc_tx")).toContain("Max-Age=0");
    expect(findUserByUsername("oidc-member")?.password).toBeNull();
  });

  it("uses the configured redirect URI for token exchange behind a proxy", async () => {
    setOidcEnv({
      OIDC_REDIRECT_URI: "https://public.example.com/api/auth/oidc/callback",
    });
    const app = createTestApp();
    mockIssuerFetch();

    const start = await app.request("/api/auth/oidc/start?callbackUrl=/");
    const tx = verifyOidcTx(cookieValue(findSetCookie(start.headers, "eb_oidc_tx")));
    mockIssuerFetch({ nonce: tx?.nonce });

    const callback = await app.request(
      `http://internal.service.local/api/auth/oidc/callback?code=auth-code&state=${tx?.state}`,
      { headers: { cookie: `eb_oidc_tx=${encodeURIComponent(signOidcTx(tx!))}` } }
    );

    expect(callback.status).toBe(302);
    const tokenBody = new URLSearchParams(tokenRequestBodies.at(-1));
    expect(tokenBody.get("redirect_uri")).toBe(
      "https://public.example.com/api/auth/oidc/callback"
    );
  });

  it("rejects a tampered state", async () => {
    const app = createTestApp();
    mockIssuerFetch();
    const signedTx = signOidcTx({
      state: "expected",
      nonce: "nonce",
      codeVerifier: "verifier",
      callbackUrl: "/private",
    });
    mockIssuerFetch({ nonce: "nonce" });

    const callback = await app.request(
      "/api/auth/oidc/callback?code=auth-code&state=tampered",
      { headers: { cookie: `eb_oidc_tx=${encodeURIComponent(signedTx)}` } }
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/login?error=oidc_failed");
  });

  it("rejects a wrong or absent nonce", async () => {
    const app = createTestApp();
    const signedTx = signOidcTx({
      state: "state",
      nonce: "expected-nonce",
      codeVerifier: "verifier",
      callbackUrl: "/private",
    });

    mockIssuerFetch({ nonce: "wrong-nonce" });
    const wrongNonce = await app.request(
      "/api/auth/oidc/callback?code=auth-code&state=state",
      { headers: { cookie: `eb_oidc_tx=${encodeURIComponent(signedTx)}` } }
    );
    expect(wrongNonce.status).toBe(302);
    expect(wrongNonce.headers.get("location")).toBe("/login?error=oidc_failed");

    resetOidcDiscoveryCache();
    mockIssuerFetch({ omitNonce: true });
    const absentNonce = await app.request(
      "/api/auth/oidc/callback?code=auth-code&state=state",
      { headers: { cookie: `eb_oidc_tx=${encodeURIComponent(signedTx)}` } }
    );
    expect(absentNonce.status).toBe(302);
    expect(absentNonce.headers.get("location")).toBe("/login?error=oidc_failed");
  });

  it("rejects an expired transaction cookie before token exchange", async () => {
    const app = createTestApp();
    const fetchMock = mockIssuerFetch({ nonce: "nonce" });
    const signedTx = signOidcTx(
      {
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        callbackUrl: "/private",
      },
      1
    );

    const callback = await app.request(
      "/api/auth/oidc/callback?code=auth-code&state=state",
      { headers: { cookie: `eb_oidc_tx=${encodeURIComponent(signedTx)}` } }
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/login?error=oidc_failed");
    expect(fetchMock).not.toHaveBeenCalledWith(tokenEndpoint, expect.anything());
  });

  it("falls back to / for absolute and protocol-relative callback URLs", async () => {
    const app = createTestApp();
    mockIssuerFetch();

    const absolute = await app.request(
      "/api/auth/oidc/start?callbackUrl=https%3A%2F%2Fevil.example%2Fpwn"
    );
    const protocolRelative = await app.request(
      "/api/auth/oidc/start?callbackUrl=%2F%2Fevil.example%2Fpwn"
    );

    expect(
      verifyOidcTx(cookieValue(findSetCookie(absolute.headers, "eb_oidc_tx")))
        ?.callbackUrl
    ).toBe("/");
    expect(
      verifyOidcTx(
        cookieValue(findSetCookie(protocolRelative.headers, "eb_oidc_tx"))
      )?.callbackUrl
    ).toBe("/");
  });

  it("returns 503 from start when issuer discovery fails", async () => {
    const app = createTestApp();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 }))
    );

    const start = await app.request("/api/auth/oidc/start");

    expect(start.status).toBe(503);
    await expect(start.json()).resolves.toEqual({
      error: "OIDC discovery unavailable",
    });
  });

  it("returns 404 for OIDC routes and disabled config when OIDC is off", async () => {
    setOidcEnv({
      OIDC_ENABLED: "false",
      OIDC_ISSUER: undefined,
      OIDC_CLIENT_ID: undefined,
      OIDC_CLIENT_SECRET: undefined,
      OIDC_REDIRECT_URI: undefined,
    });
    const app = createTestApp();

    const start = await app.request("/api/auth/oidc/start");
    const callback = await app.request("/api/auth/oidc/callback");
    const config = await app.request("/api/auth/config");

    expect(start.status).toBe(404);
    expect(callback.status).toBe(404);
    await expect(config.json()).resolves.toEqual({
      local: true,
      oidc: { enabled: false, label: "Sign in with SSO" },
    });
  });

  it("disables local login while OIDC sessions and API keys still authenticate", async () => {
    setOidcEnv({ AUTH_LOCAL_ENABLED: "false" });
    const app = createTestApp();
    mockIssuerFetch();

    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    expect(login.status).toBe(403);
    await expect(login.json()).resolves.toEqual({
      error: "Local login is disabled",
    });

    const start = await app.request("/api/auth/oidc/start?callbackUrl=/");
    const tx = verifyOidcTx(cookieValue(findSetCookie(start.headers, "eb_oidc_tx")));
    mockIssuerFetch({ nonce: tx?.nonce });
    const callback = await app.request(
      `/api/auth/oidc/callback?code=auth-code&state=${tx?.state}`,
      { headers: { cookie: `eb_oidc_tx=${encodeURIComponent(signOidcTx(tx!))}` } }
    );
    const sessionCookie = findSetCookie(callback.headers, SESSION_COOKIE_NAME)
      .split(";")[0];

    const sessionRead = await app.request("/read", {
      headers: { cookie: sessionCookie },
    });
    expect(sessionRead.status).toBe(200);
    await expect(sessionRead.json()).resolves.toMatchObject({
      user: { username: "oidc-member" },
      apiKeyScope: null,
    });

    const user = findUserByUsername("oidc-member");
    const { key } = createApiKey(user!.id, "read", "read");
    const keyRead = await app.request("/read", {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(keyRead.status).toBe(200);
    await expect(keyRead.json()).resolves.toMatchObject({
      apiKeyScope: "read",
    });
  });
});
