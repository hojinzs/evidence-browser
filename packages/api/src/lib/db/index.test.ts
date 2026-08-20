import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createTestDb, runMigrations } from "./index";

const CURRENT_V1_SCHEMA = `
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

CREATE TABLE IF NOT EXISTS bundle_share_tokens (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  bundle_id    TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  token_prefix TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bundle_share_tokens_bundle ON bundle_share_tokens(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_share_tokens_hash ON bundle_share_tokens(token_hash);
`;

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

function indexExists(db: Database.Database, indexName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`)
    .get(indexName);
  return row !== undefined;
}

function getColumn(
  db: Database.Database,
  tableName: string,
  columnName: string
): { name: string; notnull: number } {
  const columns = db.pragma(`table_info(${tableName})`) as Array<{
    name: string;
    notnull: number;
  }>;
  const column = columns.find((row) => row.name === columnName) as
    | { name: string; notnull: number }
    | undefined;

  if (!column) {
    throw new Error(`Column not found: ${tableName}.${columnName}`);
  }

  return column;
}

function schemaSignature(db: Database.Database): Array<{
  type: string;
  name: string;
  tableName: string;
  sql: string | null;
}> {
  return db
    .prepare(
      `SELECT type, name, tbl_name as tableName, sql
       FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`
    )
    .all() as Array<{
    type: string;
    name: string;
    tableName: string;
    sql: string | null;
  }>;
}

function createCurrentV1DbWithRows(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(CURRENT_V1_SCHEMA);

  const user = db
    .prepare(
      `INSERT INTO users (username, password, role)
       VALUES ('admin', 'hashed', 'admin')
       RETURNING id`
    )
    .get() as { id: string };
  const workspace = db
    .prepare(
      `INSERT INTO workspaces (slug, name, description, created_by)
       VALUES ('default', 'Default', '', ?)
       RETURNING id`
    )
    .get(user.id) as { id: string };
  const bundle = db
    .prepare(
      `INSERT INTO bundles (bundle_id, workspace_id, title, storage_key, size_bytes, uploaded_by)
       VALUES ('bundle-1', ?, 'Bundle 1', 'bundles/bundle-1.zip', 123, ?)
       RETURNING id`
    )
    .get(workspace.id, user.id) as { id: string };

  db.prepare(
    `INSERT INTO sessions (user_id, expires_at)
     VALUES (?, datetime('now', '+1 hour'))`
  ).run(user.id);
  db.prepare(
    `INSERT INTO api_keys (name, key_prefix, key_hash, user_id, scope)
     VALUES ('upload key', 'eb_12345678', 'hash-1', ?, 'upload')`
  ).run(user.id);
  db.prepare(
    `INSERT INTO bundle_share_tokens (bundle_id, token_prefix, token_hash, created_by)
     VALUES (?, 'ebs_12345678', 'share-hash-1', ?)`
  ).run(bundle.id, user.id);

  db.pragma("user_version = 1");
  return db;
}

describe("db migrations", () => {
  it("creates test databases through the migration path", () => {
    const db = createTestDb();

    expect(getUserVersion(db)).toBe(3);
    expect(tableExists(db, "bundle_share_tokens")).toBe(true);
    expect(tableExists(db, "identities")).toBe(true);
    expect(getColumn(db, "users", "password").notnull).toBe(0);
    expect(getColumn(db, "users", "email").notnull).toBe(0);
    expect(indexExists(db, "idx_users_email")).toBe(true);

    db.close();
  });

  it("upgrades a user_version 0 pre-share-token database idempotently", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(PRE_SHARE_TOKEN_SCHEMA);

    expect(getUserVersion(db)).toBe(0);
    expect(tableExists(db, "bundle_share_tokens")).toBe(false);

    runMigrations(db);

    expect(getUserVersion(db)).toBe(3);
    expect(tableExists(db, "bundle_share_tokens")).toBe(true);
    expect(tableExists(db, "identities")).toBe(true);
    expect(getColumn(db, "users", "password").notnull).toBe(0);
    expect(getColumn(db, "users", "email").notnull).toBe(0);
    expect(indexExists(db, "idx_users_email")).toBe(true);

    runMigrations(db);

    expect(getUserVersion(db)).toBe(3);
    expect(tableExists(db, "bundle_share_tokens")).toBe(true);

    db.close();
  });

  it("upgrades a current user_version 1 database and preserves foreign-keyed rows", () => {
    const db = createCurrentV1DbWithRows();

    expect(getUserVersion(db)).toBe(1);
    expect(tableExists(db, "identities")).toBe(false);

    runMigrations(db);

    expect(getUserVersion(db)).toBe(3);
    expect(tableExists(db, "identities")).toBe(true);
    expect(getColumn(db, "users", "password").notnull).toBe(0);
    expect(getColumn(db, "users", "email").notnull).toBe(0);
    expect(indexExists(db, "idx_users_email")).toBe(true);
    expect(db.prepare(`SELECT COUNT(*) as count FROM users`).get()).toEqual({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) as count FROM workspaces`).get()).toEqual({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) as count FROM bundles`).get()).toEqual({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) as count FROM sessions`).get()).toEqual({ count: 1 });
    expect(db.prepare(`SELECT COUNT(*) as count FROM api_keys`).get()).toEqual({ count: 1 });
    expect(
      db.prepare(`SELECT COUNT(*) as count FROM bundle_share_tokens`).get()
    ).toEqual({ count: 1 });
    expect(db.pragma("foreign_key_check")).toEqual([]);

    db.close();
  });

  it("creates the same schema for fresh and migrated user_version 1 databases", () => {
    const migrated = createCurrentV1DbWithRows();
    runMigrations(migrated);

    const fresh = createTestDb();

    expect(schemaSignature(migrated)).toEqual(schemaSignature(fresh));

    migrated.close();
    fresh.close();
  });
});
