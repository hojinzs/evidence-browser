import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "./index";
import type Database from "better-sqlite3";

let testDb: Database.Database;

vi.mock("./index", async (importOriginal) => {
  const original = await importOriginal<typeof import("./index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

function createTestUser(): string {
  const stmt = testDb.prepare(
    `INSERT INTO users (username, password, role) VALUES (?, 'hashed', 'admin') RETURNING id`
  );
  const row = stmt.get(`user_${Date.now()}_${Math.random()}`) as { id: string };
  return row.id;
}

import {
  createSession,
  findSession,
  deleteSession,
  deleteUserSessions,
  deleteExpiredSessions,
} from "./sessions";

describe("sessions DAO", () => {
  let userId: string;

  beforeEach(() => {
    testDb = createTestDb();
    userId = createTestUser();
  });

  it("creates and finds a session", () => {
    const session = createSession(userId);
    expect(session.id).toBeDefined();
    expect(session.user_id).toBe(userId);

    const found = findSession(session.id);
    expect(found).toBeDefined();
    expect(found!.user_id).toBe(userId);
  });

  it("does not find expired session", () => {
    // Insert an already-expired session
    testDb.prepare(
      `INSERT INTO sessions (user_id, expires_at) VALUES (?, datetime('now', '-1 hour'))`
    ).run(userId);

    const all = testDb.prepare(`SELECT * FROM sessions`).all() as { id: string }[];
    expect(all).toHaveLength(1);

    const found = findSession(all[0].id);
    expect(found).toBeUndefined();
  });

  it("deletes a session", () => {
    const session = createSession(userId);
    const deleted = deleteSession(session.id);
    expect(deleted).toBe(true);

    const found = findSession(session.id);
    expect(found).toBeUndefined();
  });

  it("deletes all sessions for a user", () => {
    createSession(userId);
    createSession(userId);
    const count = deleteUserSessions(userId);
    expect(count).toBe(2);
  });

  it("deletes expired sessions", () => {
    // Create valid session
    createSession(userId);
    // Create expired session
    testDb.prepare(
      `INSERT INTO sessions (user_id, expires_at) VALUES (?, datetime('now', '-1 hour'))`
    ).run(userId);

    const deleted = deleteExpiredSessions();
    expect(deleted).toBe(1);

    const remaining = testDb.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number };
    expect(remaining.count).toBe(1);
  });
});
