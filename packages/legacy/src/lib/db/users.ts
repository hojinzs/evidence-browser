import { hash, verify } from "@node-rs/argon2";
import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface User {
  id: string;
  username: string;
  password: string;
  role: "admin" | "user";
  created_at: string;
  updated_at: string;
}

export type UserPublic = Omit<User, "password">;

function db(): Database.Database {
  return getDb();
}

export async function createUser(
  username: string,
  plainPassword: string,
  role: "admin" | "user"
): Promise<UserPublic> {
  const hashed = await hash(plainPassword);
  const stmt = db().prepare(
    `INSERT INTO users (username, password, role) VALUES (?, ?, ?) RETURNING id, username, role, created_at, updated_at`
  );
  return stmt.get(username, hashed, role) as UserPublic;
}

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return verify(hashedPassword, plainPassword);
}

export function findUserByUsername(username: string): User | undefined {
  const stmt = db().prepare(`SELECT * FROM users WHERE username = ?`);
  return stmt.get(username) as User | undefined;
}

export function findUserById(id: string): User | undefined {
  const stmt = db().prepare(`SELECT * FROM users WHERE id = ?`);
  return stmt.get(id) as User | undefined;
}

export function findUserPublicById(id: string): UserPublic | undefined {
  const stmt = db().prepare(
    `SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?`
  );
  return stmt.get(id) as UserPublic | undefined;
}

export function listUsers(): UserPublic[] {
  const stmt = db().prepare(
    `SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at`
  );
  return stmt.all() as UserPublic[];
}

export function countAdmins(): number {
  const stmt = db().prepare(
    `SELECT COUNT(*) as count FROM users WHERE role = 'admin'`
  );
  const row = stmt.get() as { count: number };
  return row.count;
}

export function updateUserRole(id: string, role: "admin" | "user"): boolean {
  const stmt = db().prepare(
    `UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`
  );
  const result = stmt.run(role, id);
  return result.changes > 0;
}

export async function updateUserPassword(
  id: string,
  plainPassword: string
): Promise<boolean> {
  const hashed = await hash(plainPassword);
  const stmt = db().prepare(
    `UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?`
  );
  const result = stmt.run(hashed, id);
  return result.changes > 0;
}

export function deleteUser(id: string): boolean {
  const stmt = db().prepare(`DELETE FROM users WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}
