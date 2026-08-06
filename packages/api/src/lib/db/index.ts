import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { getEnv } from "@/config/env";

const SCHEMA = `
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

type Migration = {
  version: number;
  up: (db: Database.Database) => void;
};

const MIGRATIONS: Migration[] = [
  {
    version: 0,
    up(db) {
      db.exec(SCHEMA);
    },
  },
];

const TARGET_USER_VERSION = MIGRATIONS.length;

let _db: Database.Database | null = null;

function getUserVersion(db: Database.Database): number {
  const version = db.pragma("user_version", { simple: true });
  if (typeof version !== "number") {
    throw new Error("SQLite user_version pragma did not return a number");
  }
  return version;
}

export function runMigrations(db: Database.Database): void {
  const currentVersion = getUserVersion(db);

  if (currentVersion > TARGET_USER_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${TARGET_USER_VERSION}`
    );
  }

  if (currentVersion === TARGET_USER_VERSION) return;

  const migrate = db.transaction(() => {
    for (const migration of MIGRATIONS.slice(currentVersion)) {
      migration.up(db);
      db.pragma(`user_version = ${migration.version + 1}`);
    }
  });

  migrate();
}

function initializeDb(db: Database.Database, options: { useWal?: boolean } = {}): void {
  if (options.useWal) {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");
  runMigrations(db);
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const dataDir = getEnv().DATA_DIR;
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, "evidence.db");
  _db = new Database(dbPath);

  initializeDb(_db, { useWal: true });

  return _db;
}

/** Create an in-memory database for testing */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  initializeDb(db);
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Reset the singleton (for testing) */
export function resetDb(): void {
  closeDb();
}
