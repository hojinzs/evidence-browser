import type {
  ApiKeyPublic,
  ApiKeyScope,
  ApiKeyWithUser,
  AuthUser,
  Bundle,
  BundleMetaResponse,
  UserPublic,
  Workspace,
  WorkspaceWithBundleCount,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  return new ApiError(res.status, body.error ?? res.statusText);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiText(path: string): Promise<string> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw await parseError(res);
  return res.text();
}

export const api = {
  me: () => apiFetch<{ user: AuthUser }>("/api/auth/me"),
  login: (username: string, password: string) =>
    apiFetch<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  getWorkspaces: () => apiFetch<{ workspaces: WorkspaceWithBundleCount[] }>("/api/w"),
  getBundles: (ws: string) => apiFetch<{ bundles: Bundle[] }>(`/api/w/${ws}/bundle`),
  uploadBundle: (ws: string, formData: FormData) =>
    fetch(`/api/w/${ws}/bundle`, { method: "POST", body: formData, credentials: "include" }).then(async (res) => {
      if (!res.ok) throw await parseError(res);
      return res.json() as Promise<{ bundle: Bundle }>;
    }),
  deleteBundle: (ws: string, bundleId: string) =>
    apiFetch<void>(`/api/w/${ws}/bundles/${bundleId}`, { method: "DELETE" }),
  getBundleMeta: (ws: string, bundleId: string) =>
    apiFetch<BundleMetaResponse>(`/api/w/${ws}/bundles/${bundleId}/meta`),
  getBundleTree: (ws: string, bundleId: string) =>
    apiFetch<{ tree: import("@/lib/bundle/types").TreeNode[] }>(`/api/w/${ws}/bundles/${bundleId}/tree`),
  getBundleFileText: (ws: string, bundleId: string, filePath: string) =>
    apiText(`/api/w/${ws}/bundles/${bundleId}/file?path=${encodeURIComponent(filePath)}`),
  getMyApiKeys: () => apiFetch<{ keys: ApiKeyPublic[] }>("/api/api-keys"),
  getAdminApiKeys: () => apiFetch<{ keys: ApiKeyWithUser[] }>("/api/admin/api-keys"),
  createApiKey: (body: { name: string; scope: ApiKeyScope; userId?: string; expiresAt?: string }) =>
    apiFetch<{ key: string; record: ApiKeyPublic }>("/api/api-keys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteApiKey: (id: string) => apiFetch<void>(`/api/api-keys/${id}`, { method: "DELETE" }),
  getUsers: () => apiFetch<{ users: UserPublic[] }>("/api/admin/users"),
  createUser: (body: { username: string; password: string; role: "admin" | "user" }) =>
    apiFetch<{ user: UserPublic }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateUserRole: (id: string, role: "admin" | "user") =>
    apiFetch<{ ok: true }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  deleteUser: (id: string) => apiFetch<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),
  createWorkspace: (body: { slug: string; name: string; description?: string }) =>
    apiFetch<{ workspace: Workspace }>("/api/w", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateWorkspace: (id: string, body: { name?: string; description?: string }) =>
    apiFetch<{ workspace: Workspace }>(`/api/w/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteWorkspace: (id: string) =>
    apiFetch<{ success: true }>("/api/w", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    }),
  setupStatus: () =>
    apiFetch<{ needsSetup: boolean; hasAdmin: boolean; hasWorkspace: boolean }>("/api/setup/status"),
  setupAdmin: (username: string, password: string) =>
    apiFetch<{ user: AuthUser }>("/api/setup/admin", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  setupVerifyStorage: () =>
    apiFetch<{ ok: boolean; storageType?: string; bundleCount?: number; error?: string }>("/api/setup/verify-storage", {
      method: "POST",
    }),
  setupWorkspace: (slug: string, name: string, description?: string) =>
    apiFetch<{ workspace: Workspace }>("/api/setup/workspace", {
      method: "POST",
      body: JSON.stringify({ slug, name, description }),
    }),
};
