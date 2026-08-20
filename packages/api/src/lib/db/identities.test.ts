import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./index";

let testDb: Database.Database;

vi.mock("./index", async (importOriginal) => {
  const original = await importOriginal<typeof import("./index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

function createTestUser(): string {
  const row = testDb
    .prepare(
      `INSERT INTO users (username, password, role)
       VALUES (?, NULL, 'user')
       RETURNING id`
    )
    .get(`oidc_${Date.now()}_${Math.random()}`) as { id: string };
  return row.id;
}

import {
  findIdentity,
  linkIdentity,
  listIdentitiesForUser,
  unlinkIdentity,
} from "./identities";

describe("identities DAO", () => {
  let userId: string;

  beforeEach(() => {
    testDb = createTestDb();
    userId = createTestUser();
  });

  it("links and finds an identity by provider subject", () => {
    const identity = linkIdentity(
      userId,
      "oidc",
      "subject-123",
      "user@example.com"
    );

    expect(identity).toMatchObject({
      user_id: userId,
      provider: "oidc",
      provider_sub: "subject-123",
      email: "user@example.com",
    });
    expect(findIdentity("oidc", "subject-123")).toMatchObject({
      id: identity.id,
      user_id: userId,
    });
  });

  it("lists identities for one user only", () => {
    const otherUserId = createTestUser();
    linkIdentity(userId, "oidc", "subject-1", null);
    linkIdentity(userId, "oidc", "subject-2", "user@example.com");
    linkIdentity(otherUserId, "oidc", "subject-3", "other@example.com");

    expect(listIdentitiesForUser(userId)).toHaveLength(2);
    expect(listIdentitiesForUser(otherUserId)).toHaveLength(1);
  });

  it("rejects duplicate provider subject pairs", () => {
    linkIdentity(userId, "oidc", "subject-123", null);

    expect(() =>
      linkIdentity(userId, "oidc", "subject-123", null)
    ).toThrow();
  });

  it("unlinks an identity", () => {
    const identity = linkIdentity(userId, "oidc", "subject-123", null);

    expect(unlinkIdentity(identity.id)).toBe(true);
    expect(findIdentity("oidc", "subject-123")).toBeUndefined();
    expect(unlinkIdentity(identity.id)).toBe(false);
  });
});
