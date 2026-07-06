import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./index";

let testDb: Database.Database;

vi.mock("./index", async (importOriginal) => {
  const original = await importOriginal<typeof import("./index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function createTestUser(username: string, role: "admin" | "user" = "user"): string {
  const stmt = testDb.prepare(
    `INSERT INTO users (username, password, role) VALUES (?, 'hashed', ?) RETURNING id`
  );
  const row = stmt.get(username, role) as { id: string };
  return row.id;
}

import {
  createApiKey,
  deleteApiKey,
  findApiKeyByHash,
} from "./api-keys";

describe("api keys DAO", () => {
  let ownerId: string;
  let otherUserId: string;
  let adminId: string;

  beforeEach(() => {
    testDb = createTestDb();
    ownerId = createTestUser("owner");
    otherUserId = createTestUser("other");
    adminId = createTestUser("admin", "admin");
  });

  it("creates eb-prefixed keys and stores the matching hash", () => {
    const { key, record } = createApiKey(ownerId, "deploy", "upload");

    expect(key).toMatch(/^eb_[a-f0-9]{32}$/);
    expect(record.key_prefix).toBe(key.slice(0, 11));
    expect(record.user_id).toBe(ownerId);

    const row = testDb
      .prepare(`SELECT key_hash, key_prefix FROM api_keys WHERE id = ?`)
      .get(record.id) as { key_hash: string; key_prefix: string };

    expect(row.key_prefix).toBe(record.key_prefix);
    expect(row.key_hash).toBe(hashKey(key));
  });

  it("finds active keys but not expired or unknown keys", () => {
    const active = createApiKey(ownerId, "active", "read");
    const expired = createApiKey(
      ownerId,
      "expired",
      "read",
      "2000-01-01T00:00:00.000Z"
    );

    expect(findApiKeyByHash(active.key)?.id).toBe(active.record.id);
    expect(findApiKeyByHash(expired.key)).toBeUndefined();
    expect(findApiKeyByHash("eb_00000000000000000000000000000000")).toBeUndefined();
  });

  it("scopes deletion to owners unless the caller is an admin", () => {
    const ownerKey = createApiKey(ownerId, "owner key", "read");
    const otherKey = createApiKey(otherUserId, "other key", "read");

    expect(deleteApiKey(ownerKey.record.id, otherUserId, false)).toBe(false);
    expect(findApiKeyByHash(ownerKey.key)?.id).toBe(ownerKey.record.id);

    expect(deleteApiKey(ownerKey.record.id, ownerId, false)).toBe(true);
    expect(findApiKeyByHash(ownerKey.key)).toBeUndefined();

    expect(deleteApiKey(otherKey.record.id, adminId, true)).toBe(true);
    expect(findApiKeyByHash(otherKey.key)).toBeUndefined();
  });
});
