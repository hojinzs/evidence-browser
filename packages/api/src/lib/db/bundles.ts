import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface Bundle {
  id: string;
  bundle_id: string;
  workspace_id: string;
  title: string | null;
  storage_key: string;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface BundleWithUploader extends Bundle {
  uploader_username: string;
}

function db(): Database.Database {
  return getDb();
}

export function createBundle(data: {
  bundleId: string;
  workspaceId: string;
  title: string | null;
  storageKey: string;
  sizeBytes: number | null;
  uploadedBy: string;
}): Bundle {
  const stmt = db().prepare(
    `INSERT INTO bundles (bundle_id, workspace_id, title, storage_key, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING *`
  );
  return stmt.get(
    data.bundleId,
    data.workspaceId,
    data.title,
    data.storageKey,
    data.sizeBytes,
    data.uploadedBy
  ) as Bundle;
}

export function findBundle(
  workspaceId: string,
  bundleId: string
): Bundle | undefined {
  const stmt = db().prepare(
    `SELECT * FROM bundles WHERE workspace_id = ? AND bundle_id = ?`
  );
  return stmt.get(workspaceId, bundleId) as Bundle | undefined;
}

export function findBundleByStorageKey(
  storageKey: string
): Bundle | undefined {
  const stmt = db().prepare(`SELECT * FROM bundles WHERE storage_key = ?`);
  return stmt.get(storageKey) as Bundle | undefined;
}

export function listBundles(workspaceId: string): BundleWithUploader[] {
  const stmt = db().prepare(`
    SELECT b.*, u.username as uploader_username
    FROM bundles b
    JOIN users u ON b.uploaded_by = u.id
    WHERE b.workspace_id = ?
    ORDER BY b.created_at DESC
  `);
  return stmt.all(workspaceId) as BundleWithUploader[];
}

export function countBundles(workspaceId: string): number {
  const stmt = db().prepare(
    `SELECT COUNT(*) as count FROM bundles WHERE workspace_id = ?`
  );
  const row = stmt.get(workspaceId) as { count: number };
  return row.count;
}

export function deleteBundle(id: string): boolean {
  const stmt = db().prepare(`DELETE FROM bundles WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

export function deleteBundleByKey(
  workspaceId: string,
  bundleId: string
): boolean {
  const stmt = db().prepare(
    `DELETE FROM bundles WHERE workspace_id = ? AND bundle_id = ?`
  );
  const result = stmt.run(workspaceId, bundleId);
  return result.changes > 0;
}
