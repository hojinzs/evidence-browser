import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createTestDb, runMigrations } from "./index";

const PRE_SHARE_TOKEN_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username   TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bundles (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  bundle_id    TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT,
  storage_key  TEXT NOT NULL UNIQUE,
  size_bytes   INTEGER,
  uploaded_by  TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, bundle_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_bundles_workspace ON bundles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name         TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL CHECK (scope IN ('read', 'upload', 'admin')),
  expires_at   TEXT,
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
`;

function getUserVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tableName);
  return row !== undefined;
}

describe("db migrations", () => {
  it("creates test databases through the migration path", () => {
    const db = createTestDb();

    expect(getUserVersion(db)).toBe(1);
    expect(tableExists(db, "bundle_share_tokens")).toBe(true);

    db.close();
  });

  it("upgrades a user_version 0 pre-share-token database idempotently", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(PRE_SHARE_TOKEN_SCHEMA);

    expect(getUserVersion(db)).toBe(0);
    expect(tableExists(db, "bundle_share_tokens")).toBe(false);

    runMigrations(db);

    expect(getUserVersion(db)).toBe(1);
    expect(tableExists(db, "bundle_share_tokens")).toBe(true);

    runMigrations(db);

    expect(getUserVersion(db)).toBe(1);
    expect(tableExists(db, "bundle_share_tokens")).toBe(true);

    db.close();
  });
});
