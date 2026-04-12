import { createHash, randomBytes } from "crypto";
import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  user_id: string;
  scope: "read" | "upload" | "admin";
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export type ApiKeyPublic = Omit<ApiKey, "key_hash">;

export interface ApiKeyWithUser extends ApiKeyPublic {
  username: string;
}

function db(): Database.Database {
  return getDb();
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key.
 * Format: "eb_" + 32 hex chars = 35 chars total.
 * key_prefix: first 11 chars ("eb_" + 8 hex chars) for display.
 */
export function createApiKey(
  userId: string,
  name: string,
  scope: "read" | "upload" | "admin",
  expiresAt?: string
): { key: string; record: ApiKeyPublic } {
  const rawBytes = randomBytes(16).toString("hex"); // 32 hex chars
  const key = `eb_${rawBytes}`; // total 35 chars
  const key_prefix = key.slice(0, 11); // "eb_" + 8 chars
  const key_hash = hashKey(key);

  const stmt = db().prepare(
    `INSERT INTO api_keys (name, key_prefix, key_hash, user_id, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id, name, key_prefix, user_id, scope, expires_at, last_used_at, created_at`
  );

  const record = stmt.get(
    name,
    key_prefix,
    key_hash,
    userId,
    scope,
    expiresAt ?? null
  ) as ApiKeyPublic;

  return { key, record };
}

/**
 * Look up an API key by its raw value.
 * Returns undefined if not found or if the key is expired.
 */
export function findApiKeyByHash(rawKey: string): ApiKey | undefined {
  const key_hash = hashKey(rawKey);
  const stmt = db().prepare(
    `SELECT * FROM api_keys WHERE key_hash = ?`
  );
  const row = stmt.get(key_hash) as ApiKey | undefined;
  if (!row) return undefined;

  // Check expiry
  if (row.expires_at !== null) {
    const expiresMs = Date.parse(row.expires_at);
    if (!isNaN(expiresMs) && expiresMs < Date.now()) {
      return undefined;
    }
  }

  return row;
}

/** List all API keys belonging to a specific user (public fields only). */
export function listApiKeysByUser(userId: string): ApiKeyPublic[] {
  const stmt = db().prepare(
    `SELECT id, name, key_prefix, user_id, scope, expires_at, last_used_at, created_at
     FROM api_keys
     WHERE user_id = ?
     ORDER BY created_at DESC`
  );
  return stmt.all(userId) as ApiKeyPublic[];
}

/** List all API keys across all users, joined with username (admin view). */
export function listAllApiKeys(): ApiKeyWithUser[] {
  const stmt = db().prepare(
    `SELECT k.id, k.name, k.key_prefix, k.user_id, k.scope,
            k.expires_at, k.last_used_at, k.created_at,
            u.username
     FROM api_keys k
     JOIN users u ON k.user_id = u.id
     ORDER BY k.created_at DESC`
  );
  return stmt.all() as ApiKeyWithUser[];
}

/**
 * Delete an API key.
 * If isAdmin is false, only the owning user can delete their own key.
 * Returns true if a row was deleted.
 */
export function deleteApiKey(
  id: string,
  userId: string,
  isAdmin: boolean
): boolean {
  let stmt: Database.Statement;
  let result: Database.RunResult;

  if (isAdmin) {
    stmt = db().prepare(`DELETE FROM api_keys WHERE id = ?`);
    result = stmt.run(id);
  } else {
    stmt = db().prepare(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`);
    result = stmt.run(id, userId);
  }

  return result.changes > 0;
}

/** Update last_used_at timestamp for a key (fire-and-forget). */
export function updateApiKeyLastUsed(id: string): void {
  const stmt = db().prepare(
    `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`
  );
  stmt.run(id);
}
