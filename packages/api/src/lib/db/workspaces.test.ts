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

// We need a real user for foreign keys
function createTestUser(role: "admin" | "user" = "admin"): string {
  const stmt = testDb.prepare(
    `INSERT INTO users (username, password, role) VALUES (?, 'hashed', ?) RETURNING id`
  );
  const row = stmt.get(`user_${Date.now()}_${Math.random()}`, role) as { id: string };
  return row.id;
}

import {
  createWorkspace,
  findWorkspaceBySlug,
  findWorkspaceById,
  listWorkspaces,
  listWorkspacesWithBundleCount,
  updateWorkspace,
  deleteWorkspace,
  deleteWorkspaceBySlug,
} from "./workspaces";

describe("workspaces DAO", () => {
  let userId: string;

  beforeEach(() => {
    testDb = createTestDb();
    userId = createTestUser();
  });

  it("creates a workspace and finds by slug", () => {
    const ws = createWorkspace("infra", "Infrastructure", "Infra team bundles", userId);
    expect(ws.slug).toBe("infra");
    expect(ws.name).toBe("Infrastructure");

    const found = findWorkspaceBySlug("infra");
    expect(found).toBeDefined();
    expect(found!.id).toBe(ws.id);
  });

  it("finds workspace by id", () => {
    const ws = createWorkspace("test", "Test", "", userId);
    const found = findWorkspaceById(ws.id);
    expect(found).toBeDefined();
    expect(found!.slug).toBe("test");
  });

  it("lists all workspaces", () => {
    createWorkspace("a", "A", "", userId);
    createWorkspace("b", "B", "", userId);
    const all = listWorkspaces();
    expect(all).toHaveLength(2);
  });

  it("lists workspaces with bundle count", () => {
    const ws = createWorkspace("ws1", "WS1", "", userId);
    // Add a bundle record
    testDb.prepare(
      `INSERT INTO bundles (bundle_id, workspace_id, title, storage_key, uploaded_by) VALUES (?, ?, ?, ?, ?)`
    ).run("b1", ws.id, "Test", "ws1/b1.zip", userId);

    const list = listWorkspacesWithBundleCount();
    expect(list).toHaveLength(1);
    expect(list[0].bundle_count).toBe(1);
  });

  it("rejects duplicate slug", () => {
    createWorkspace("dup", "Dup", "", userId);
    expect(() => createWorkspace("dup", "Dup2", "", userId)).toThrow();
  });

  it("updates workspace", () => {
    const ws = createWorkspace("upd", "Old", "Old desc", userId);
    const updated = updateWorkspace(ws.id, { name: "New", description: "New desc" });
    expect(updated).toBe(true);

    const found = findWorkspaceById(ws.id);
    expect(found!.name).toBe("New");
    expect(found!.description).toBe("New desc");
  });

  it("deletes workspace", () => {
    const ws = createWorkspace("del", "Del", "", userId);
    const deleted = deleteWorkspace(ws.id);
    expect(deleted).toBe(true);

    const found = findWorkspaceById(ws.id);
    expect(found).toBeUndefined();
  });

  it("deletes workspace by slug", () => {
    const ws = createWorkspace("slug-del", "Slug Del", "", userId);
    const deleted = deleteWorkspaceBySlug("slug-del");
    expect(deleted).toBe(true);

    const found = findWorkspaceById(ws.id);
    expect(found).toBeUndefined();
  });
});
