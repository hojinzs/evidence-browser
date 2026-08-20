import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface Identity {
  id: string;
  user_id: string;
  provider: string;
  provider_sub: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

function db(): Database.Database {
  return getDb();
}

export function findIdentity(
  provider: string,
  sub: string
): Identity | undefined {
  const stmt = db().prepare(
    `SELECT * FROM identities WHERE provider = ? AND provider_sub = ?`
  );
  return stmt.get(provider, sub) as Identity | undefined;
}

export function linkIdentity(
  userId: string,
  provider: string,
  sub: string,
  email: string | null
): Identity {
  const stmt = db().prepare(
    `INSERT INTO identities (user_id, provider, provider_sub, email)
     VALUES (?, ?, ?, ?)
     RETURNING *`
  );
  return stmt.get(userId, provider, sub, email) as Identity;
}

export function listIdentitiesForUser(userId: string): Identity[] {
  const stmt = db().prepare(
    `SELECT * FROM identities WHERE user_id = ? ORDER BY created_at`
  );
  return stmt.all(userId) as Identity[];
}

export function unlinkIdentity(id: string): boolean {
  const stmt = db().prepare(`DELETE FROM identities WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}
