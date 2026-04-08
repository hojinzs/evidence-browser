import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Inline schema to avoid __dirname + fs.readFileSync issues in Next.js bundling
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
`;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dataDir = process.env.DATA_DIR || "./data";
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, "evidence.db");
  _db = new Database(dbPath);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(SCHEMA);

  return _db;
}

/** Create an in-memory database for testing */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/** Reset the singleton (for testing) */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
