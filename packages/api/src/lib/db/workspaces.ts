import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function db(): Database.Database {
  return getDb();
}

export function createWorkspace(
  slug: string,
  name: string,
  description: string,
  createdBy: string
): Workspace {
  const stmt = db().prepare(
    `INSERT INTO workspaces (slug, name, description, created_by) VALUES (?, ?, ?, ?) RETURNING *`
  );
  return stmt.get(slug, name, description, createdBy) as Workspace;
}

export function findWorkspaceBySlug(slug: string): Workspace | undefined {
  const stmt = db().prepare(`SELECT * FROM workspaces WHERE slug = ?`);
  return stmt.get(slug) as Workspace | undefined;
}

export function findWorkspaceById(id: string): Workspace | undefined {
  const stmt = db().prepare(`SELECT * FROM workspaces WHERE id = ?`);
  return stmt.get(id) as Workspace | undefined;
}

export function listWorkspaces(): Workspace[] {
  const stmt = db().prepare(`SELECT * FROM workspaces ORDER BY created_at`);
  return stmt.all() as Workspace[];
}

export interface WorkspaceWithBundleCount extends Workspace {
  bundle_count: number;
}

export function listWorkspacesWithBundleCount(): WorkspaceWithBundleCount[] {
  const stmt = db().prepare(`
    SELECT w.*, COALESCE(b.cnt, 0) as bundle_count
    FROM workspaces w
    LEFT JOIN (SELECT workspace_id, COUNT(*) as cnt FROM bundles GROUP BY workspace_id) b
      ON w.id = b.workspace_id
    ORDER BY w.created_at
  `);
  return stmt.all() as WorkspaceWithBundleCount[];
}

export function updateWorkspace(
  id: string,
  data: { name?: string; description?: string }
): { status: "updated"; workspace: Workspace } | { status: "not_found" } | { status: "no_fields" } {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    fields.push("name = ?");
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push("description = ?");
    values.push(data.description);
  }
  if (fields.length === 0) return { status: "no_fields" };

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const stmt = db().prepare(
    `UPDATE workspaces SET ${fields.join(", ")} WHERE id = ? RETURNING *`
  );
  const workspace = stmt.get(...values) as Workspace | undefined;
  if (!workspace) return { status: "not_found" };
  return { status: "updated", workspace };
}

export function deleteWorkspace(id: string): boolean {
  const stmt = db().prepare(`DELETE FROM workspaces WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}
