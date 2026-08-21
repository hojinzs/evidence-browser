import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnv } from "@/config/env";
import { createTestDb } from "@/lib/db/index";
import { findIdentity } from "@/lib/db/identities";
import { findUserByUsername } from "@/lib/db/users";

let testDb: Database.Database;

vi.mock("@/lib/db/index", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

import { createPasswordlessUser } from "@/lib/db/users";
import {
  OidcResolutionError,
  resolveOidcUser,
  resetOidcDiscoveryCache,
  signOidcTx,
  verifyOidcTx,
  type OidcClaims,
} from "./oidc";

const originalEnv = { ...process.env };

function setBaseEnv(overrides: Record<string, string | undefined> = {}) {
  process.env.AUTH_SECRET = "test-secret";
  process.env.OIDC_ENABLED = "true";
  process.env.OIDC_ISSUER = "https://issuer.example.test";
  process.env.OIDC_CLIENT_ID = "client-id";
  process.env.OIDC_CLIENT_SECRET = "client-secret";
  process.env.OIDC_REDIRECT_URI =
    "http://localhost/api/auth/oidc/callback";
  process.env.OIDC_AUTO_PROVISION = "true";
  process.env.OIDC_LINK_BY_VERIFIED_EMAIL = "false";
  process.env.OIDC_GROUPS_CLAIM = "groups";
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

function claims(overrides: Partial<OidcClaims> = {}): OidcClaims {
  return {
    sub: "subject-1",
    preferred_username: "member",
    email: "member@example.com",
    email_verified: true,
    groups: ["users"],
    ...overrides,
  };
}

describe("OIDC transaction cookies", () => {
  beforeEach(() => {
    setBaseEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnv();
    resetOidcDiscoveryCache();
  });

  it("rejects expired transaction cookies", () => {
    const signed = signOidcTx(
      {
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        callbackUrl: "/private",
      },
      1
    );

    expect(verifyOidcTx(signed)).toBeNull();
  });
});

describe("resolveOidcUser", () => {
  beforeEach(() => {
    testDb = createTestDb();
    setBaseEnv();
  });

  afterEach(() => {
    testDb.close();
    process.env = { ...originalEnv };
    resetEnv();
    resetOidcDiscoveryCache();
  });

  it("returns the user for an existing provider subject identity", async () => {
    const user = createPasswordlessUser({
      username: "linked",
      email: "linked@example.com",
      role: "user",
    });
    testDb
      .prepare(
        `INSERT INTO identities (user_id, provider, provider_sub, email)
         VALUES (?, 'oidc', 'subject-1', 'linked@example.com')`
      )
      .run(user.id);

    await expect(resolveOidcUser(claims())).resolves.toMatchObject({
      id: user.id,
      username: "linked",
      role: "user",
    });
  });

  it("rejects users outside configured allowed groups", async () => {
    setBaseEnv({ OIDC_ALLOWED_GROUPS: "admins" });

    await expect(resolveOidcUser(claims())).rejects.toBeInstanceOf(
      OidcResolutionError
    );
  });

  it("links a verified email to an existing local user when enabled", async () => {
    setBaseEnv({ OIDC_LINK_BY_VERIFIED_EMAIL: "true" });
    const user = createPasswordlessUser({
      username: "local-user",
      email: "member@example.com",
      role: "user",
    });

    await expect(resolveOidcUser(claims())).resolves.toMatchObject({
      id: user.id,
      username: "local-user",
    });
    expect(findIdentity("oidc", "subject-1")).toMatchObject({
      user_id: user.id,
      email: "member@example.com",
    });
  });

  it("auto-provisions a passwordless user with a collision-suffixed username", async () => {
    createPasswordlessUser({
      username: "member",
      email: null,
      role: "user",
    });

    await expect(resolveOidcUser(claims())).resolves.toMatchObject({
      username: "member-2",
      role: "user",
    });
    expect(findUserByUsername("member-2")?.password).toBeNull();
  });

  it("reuses the same user row on a second login for the provider subject", async () => {
    const first = await resolveOidcUser(claims());
    const second = await resolveOidcUser(claims());

    expect(second).toMatchObject({
      id: first.id,
      username: first.username,
      role: first.role,
    });
    expect(
      (testDb.prepare(`SELECT COUNT(*) AS count FROM users`).get() as { count: number }).count
    ).toBe(1);
  });

  it("provisions admin users from the configured admin group", async () => {
    setBaseEnv({ OIDC_ADMIN_GROUP: "admins" });

    await expect(resolveOidcUser(claims({ groups: ["users", "admins"] }))).resolves.toMatchObject({
      username: "member",
      role: "admin",
    });
  });

  it("rejects when no identity, link, or provision rule matches", async () => {
    setBaseEnv({
      OIDC_AUTO_PROVISION: "false",
      OIDC_LINK_BY_VERIFIED_EMAIL: "false",
    });

    await expect(resolveOidcUser(claims())).rejects.toBeInstanceOf(
      OidcResolutionError
    );
  });

  it("does not demote the last admin during role sync", async () => {
    setBaseEnv({ OIDC_ADMIN_GROUP: "admins" });
    const admin = createPasswordlessUser({
      username: "admin",
      email: "admin@example.com",
      role: "admin",
    });
    testDb
      .prepare(
        `INSERT INTO identities (user_id, provider, provider_sub, email)
         VALUES (?, 'oidc', 'subject-1', 'admin@example.com')`
      )
      .run(admin.id);

    await expect(resolveOidcUser(claims({ groups: ["users"] }))).resolves.toMatchObject({
      id: admin.id,
      role: "admin",
    });
  });
});
