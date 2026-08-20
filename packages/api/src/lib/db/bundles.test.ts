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
  findBundleWithUploader,
  countBundles,
  listBundles,
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

  it("filters bundles by uploader, upload window, and limit", () => {
    const otherUserId = createTestUser("user");
    const oldBundle = createBundle({
      bundleId: "old",
      workspaceId,
      title: "Old",
      storageKey: "demo/old",
      sizeBytes: 128,
      uploadedBy: userId,
    });
    const newBundle = createBundle({
      bundleId: "new",
      workspaceId,
      title: "New",
      storageKey: "demo/new",
      sizeBytes: 256,
      uploadedBy: userId,
    });
    const otherBundle = createBundle({
      bundleId: "other",
      workspaceId,
      title: "Other",
      storageKey: "demo/other",
      sizeBytes: 512,
      uploadedBy: otherUserId,
    });
    testDb.prepare("UPDATE users SET username = ? WHERE id = ?").run("qa-agent", userId);
    testDb.prepare("UPDATE users SET username = ? WHERE id = ?").run("dev-agent", otherUserId);
    testDb.prepare("UPDATE bundles SET created_at = ? WHERE id = ?").run("2026-08-01 00:00:00", oldBundle.id);
    testDb.prepare("UPDATE bundles SET created_at = ? WHERE id = ?").run("2026-08-10 00:00:00", newBundle.id);
    testDb.prepare("UPDATE bundles SET created_at = ? WHERE id = ?").run("2026-08-11 00:00:00", otherBundle.id);

    const bundles = listBundles(workspaceId, {
      uploadedBy: "qa-agent",
      since: "2026-08-05T00:00:00Z",
      until: "2026-08-12T00:00:00Z",
      limit: 1,
    });

    expect(bundles.map((bundle) => bundle.bundle_id)).toEqual(["new"]);
    expect(bundles[0]?.uploader_username).toBe("qa-agent");
    expect(
      countBundles(workspaceId, {
        uploadedBy: "qa-agent",
        since: "2026-08-05T00:00:00Z",
        until: "2026-08-12T00:00:00Z",
      })
    ).toBe(1);
  });

  it("finds one bundle with uploader metadata", () => {
    testDb.prepare("UPDATE users SET username = ? WHERE id = ?").run("qa-agent", userId);
    createBundle({
      bundleId: "sample-bundle",
      workspaceId,
      title: "Sample Bundle",
      storageKey: "demo/sample-bundle",
      sizeBytes: 128,
      uploadedBy: userId,
    });

    const bundle = findBundleWithUploader(workspaceId, "sample-bundle");

    expect(bundle).toMatchObject({
      bundle_id: "sample-bundle",
      uploader_username: "qa-agent",
      workspace_id: workspaceId,
    });
  });
});
