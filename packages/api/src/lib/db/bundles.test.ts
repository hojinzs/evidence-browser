import { beforeEach, describe, expect, it, vi } from "vitest";
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

function createTestUser(role: "admin" | "user" = "admin"): string {
  const stmt = testDb.prepare(
    `INSERT INTO users (username, password, role) VALUES (?, 'hashed', ?) RETURNING id`
  );
  const row = stmt.get(`user_${Date.now()}_${Math.random()}`, role) as { id: string };
  return row.id;
}

function createTestWorkspace(createdBy: string): string {
  const stmt = testDb.prepare(
    `INSERT INTO workspaces (slug, name, description, created_by) VALUES (?, ?, '', ?) RETURNING id`
  );
  const row = stmt.get(`ws-${Date.now()}`, "Workspace", createdBy) as { id: string };
  return row.id;
}

import {
  createBundle,
  deleteBundle,
  deleteBundleByKey,
  findBundle,
} from "./bundles";

describe("bundles DAO", () => {
  let userId: string;
  let workspaceId: string;

  beforeEach(() => {
    testDb = createTestDb();
    userId = createTestUser();
    workspaceId = createTestWorkspace(userId);
  });

  it("deletes a bundle by internal id", () => {
    const bundle = createBundle({
      bundleId: "sample-bundle",
      workspaceId,
      title: "Sample Bundle",
      storageKey: "demo/sample-bundle",
      sizeBytes: 128,
      uploadedBy: userId,
    });

    expect(deleteBundle(bundle.id)).toBe(true);
    expect(findBundle(workspaceId, "sample-bundle")).toBeUndefined();
  });

  it("deletes a bundle by workspace and bundle key", () => {
    createBundle({
      bundleId: "sample-bundle",
      workspaceId,
      title: "Sample Bundle",
      storageKey: "demo/sample-bundle",
      sizeBytes: 128,
      uploadedBy: userId,
    });

    expect(deleteBundleByKey(workspaceId, "sample-bundle")).toBe(true);
    expect(findBundle(workspaceId, "sample-bundle")).toBeUndefined();
  });
});
