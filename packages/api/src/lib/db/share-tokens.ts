import { createHash, randomBytes } from "crypto";
import type Database from "better-sqlite3";
import type { BundleRow } from "./bundles";
import { getDb } from "./index";

export interface BundleShareToken {
  id: string;
  bundle_id: string;
  token_prefix: string;
  token_hash: string;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type BundleShareTokenPublic = Omit<BundleShareToken, "token_hash">;

export interface ActiveBundleShareToken extends BundleShareToken {
  bundle: BundleRow;
}

function db(): Database.Database {
  return getDb();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createBundleShareToken(data: {
  bundleInternalId: string;
  createdBy: string;
  expiresAt?: string | null;
}): { token: string; record: BundleShareTokenPublic } {
  const token = `ebs_${randomBytes(32).toString("base64url")}`;
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 12);
  const stmt = db().prepare(
    `INSERT INTO bundle_share_tokens (bundle_id, token_prefix, token_hash, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, bundle_id, token_prefix, created_by, expires_at, revoked_at, created_at`
  );

  const record = stmt.get(
    data.bundleInternalId,
    tokenPrefix,
    tokenHash,
    data.createdBy,
    data.expiresAt ?? null
  ) as BundleShareTokenPublic;

  return { token, record };
}

export function listBundleShareTokens(bundleInternalId: string): BundleShareTokenPublic[] {
  const stmt = db().prepare(
    `SELECT id, bundle_id, token_prefix, created_by, expires_at, revoked_at, created_at
     FROM bundle_share_tokens
     WHERE bundle_id = ?
     ORDER BY created_at DESC`
  );
  return stmt.all(bundleInternalId) as BundleShareTokenPublic[];
}

export function findActiveBundleShareToken(rawToken: string): ActiveBundleShareToken | undefined {
  const tokenHash = hashToken(rawToken);
  const stmt = db().prepare(
    `SELECT
       st.*,
       b.id as b_id,
       b.bundle_id as b_bundle_id,
       b.workspace_id as b_workspace_id,
       b.title as b_title,
       b.storage_key as b_storage_key,
       b.size_bytes as b_size_bytes,
       b.uploaded_by as b_uploaded_by,
       b.created_at as b_created_at
     FROM bundle_share_tokens st
     JOIN bundles b ON b.id = st.bundle_id
     WHERE st.token_hash = ?
       AND st.revoked_at IS NULL
       AND (st.expires_at IS NULL OR datetime(st.expires_at) > datetime('now'))`
  );
  const row = stmt.get(tokenHash) as (BundleShareToken & {
    b_id: string;
    b_bundle_id: string;
    b_workspace_id: string;
    b_title: string | null;
    b_storage_key: string;
    b_size_bytes: number | null;
    b_uploaded_by: string;
    b_created_at: string;
  }) | undefined;
  if (!row) return undefined;

  return {
    id: row.id,
    bundle_id: row.bundle_id,
    token_prefix: row.token_prefix,
    token_hash: row.token_hash,
    created_by: row.created_by,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    bundle: {
      id: row.b_id,
      bundle_id: row.b_bundle_id,
      workspace_id: row.b_workspace_id,
      title: row.b_title,
      storage_key: row.b_storage_key,
      size_bytes: row.b_size_bytes,
      uploaded_by: row.b_uploaded_by,
      created_at: row.b_created_at,
    },
  };
}

export function revokeBundleShareToken(data: {
  tokenId: string;
  bundleInternalId: string;
  userId: string;
  isAdmin: boolean;
}): boolean {
  const stmt = data.isAdmin
    ? db().prepare(
        `UPDATE bundle_share_tokens
         SET revoked_at = datetime('now')
         WHERE id = ? AND bundle_id = ? AND revoked_at IS NULL`
      )
    : db().prepare(
        `UPDATE bundle_share_tokens
         SET revoked_at = datetime('now')
         WHERE id = ? AND bundle_id = ? AND created_by = ? AND revoked_at IS NULL`
      );
  const result = data.isAdmin
    ? stmt.run(data.tokenId, data.bundleInternalId)
    : stmt.run(data.tokenId, data.bundleInternalId, data.userId);
  return result.changes > 0;
}
