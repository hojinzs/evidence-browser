import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface Session {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

const SESSION_TTL_HOURS = 24 * 7; // 7 days

function db(): Database.Database {
  return getDb();
}

export function createSession(userId: string): Session {
  const stmt = db().prepare(
    `INSERT INTO sessions (user_id, expires_at)
     VALUES (?, datetime('now', '+${SESSION_TTL_HOURS} hours'))
     RETURNING *`
  );
  return stmt.get(userId) as Session;
}

export function findSession(id: string): Session | undefined {
  const stmt = db().prepare(
    `SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')`
  );
  return stmt.get(id) as Session | undefined;
}

export function deleteSession(id: string): boolean {
  const stmt = db().prepare(`DELETE FROM sessions WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

export function deleteUserSessions(userId: string): number {
  const stmt = db().prepare(`DELETE FROM sessions WHERE user_id = ?`);
  const result = stmt.run(userId);
  return result.changes;
}

export function deleteExpiredSessions(): number {
  const stmt = db().prepare(
    `DELETE FROM sessions WHERE expires_at <= datetime('now')`
  );
  const result = stmt.run();
  return result.changes;
}

export function touchSession(id: string): boolean {
  const stmt = db().prepare(
    `UPDATE sessions SET expires_at = datetime('now', '+${SESSION_TTL_HOURS} hours') WHERE id = ?`
  );
  const result = stmt.run(id);
  return result.changes > 0;
}
