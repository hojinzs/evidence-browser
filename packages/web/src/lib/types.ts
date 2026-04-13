export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

export type UserPublic = AuthUser & {
  created_at: string;
  updated_at: string;
};

export type ApiKeyScope = "read" | "upload" | "admin";

export interface ApiKeyPublic {
  id: string;
  name: string;
  key_prefix: string;
  user_id: string;
  scope: ApiKeyScope;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ApiKeyWithUser extends ApiKeyPublic {
  username: string;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceWithBundleCount extends Workspace {
  bundle_count: number;
}

export interface Bundle {
  id: string;
  bundle_id: string;
  workspace_id: string;
  title: string | null;
  storage_key: string;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  uploader_username: string;
}

export interface BundleMetaResponse {
  manifest: {
    version: number;
    title: string;
    index: string;
    [key: string]: unknown;
  };
  tree: import("@/lib/bundle/types").TreeNode[];
}
