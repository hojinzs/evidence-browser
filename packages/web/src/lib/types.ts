export type {
  ApiKeyPublic,
  ApiKeyScope,
  ApiKeyWithUser,
  AuthUser,
  Bundle,
  BundleMetaResponse,
  UserPublic,
  Workspace,
  WorkspaceWithBundleCount,
} from "@evidence-browser/shared/api/types";

export interface AuthConfig {
  local: boolean;
  oidc: {
    enabled: boolean;
    label: string;
  };
}

export interface BundleShareTokenPublic {
  id: string;
  bundle_id: string;
  token_prefix: string;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
