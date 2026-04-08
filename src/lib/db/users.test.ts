import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "./index";
import type Database from "better-sqlite3";

// Mock getDb to return our test database
let testDb: Database.Database;

vi.mock("./index", async (importOriginal) => {
  const original = await importOriginal<typeof import("./index")>();
  return {
    ...original,
    getDb: () => testDb,
  };
});

import {
  createUser,
  findUserByUsername,
  findUserById,
  listUsers,
  countAdmins,
  updateUserRole,
  deleteUser,
  verifyPassword,
} from "./users";

describe("users DAO", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a user and finds by username", async () => {
    const user = await createUser("admin", "password123", "admin");
    expect(user.username).toBe("admin");
    expect(user.role).toBe("admin");
    expect(user.id).toBeDefined();

    const found = findUserByUsername("admin");
    expect(found).toBeDefined();
    expect(found!.username).toBe("admin");
  });

  it("verifies password correctly", async () => {
    await createUser("test", "correct-password", "user");
    const user = findUserByUsername("test");
    expect(user).toBeDefined();

    const valid = await verifyPassword("correct-password", user!.password);
    expect(valid).toBe(true);

    const invalid = await verifyPassword("wrong-password", user!.password);
    expect(invalid).toBe(false);
  });

  it("finds user by id", async () => {
    const user = await createUser("alice", "pass", "user");
    const found = findUserById(user.id);
    expect(found).toBeDefined();
    expect(found!.username).toBe("alice");
  });

  it("lists all users", async () => {
    await createUser("a", "p", "admin");
    await createUser("b", "p", "user");
    const users = listUsers();
    expect(users).toHaveLength(2);
  });

  it("counts admins", async () => {
    await createUser("a1", "p", "admin");
    await createUser("a2", "p", "admin");
    await createUser("u1", "p", "user");
    expect(countAdmins()).toBe(2);
  });

  it("rejects duplicate username", async () => {
    await createUser("dup", "p", "user");
    await expect(createUser("dup", "p2", "user")).rejects.toThrow();
  });

  it("updates user role", async () => {
    const user = await createUser("bob", "pass", "user");
    const updated = updateUserRole(user.id, "admin");
    expect(updated).toBe(true);

    const found = findUserById(user.id);
    expect(found!.role).toBe("admin");
  });

  it("deletes user", async () => {
    const user = await createUser("del", "pass", "user");
    const deleted = deleteUser(user.id);
    expect(deleted).toBe(true);

    const found = findUserById(user.id);
    expect(found).toBeUndefined();
  });
});
