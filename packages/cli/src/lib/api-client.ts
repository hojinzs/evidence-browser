import fs from "fs";
import path from "path";

export interface ServerRequestOptions {
  url: string;
  apiKey: string;
}

export interface BundleSummary {
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

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  bundle_count?: number;
}

export interface TreeNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: TreeNode[];
}

export interface BundleMeta {
  manifest: {
    version: number;
    title: string;
    index: string;
    [key: string]: unknown;
  };
  tree: TreeNode[];
}

export interface UploadOptions {
  filePath: string;
  workspace: string;
  bundleId?: string;
  url: string;
  apiKey: string;
}

export interface UploadResult {
  bundleId: string;
}

export interface BundleRequestOptions extends ServerRequestOptions {
  workspace: string;
  bundleId: string;
}

export interface BundleFileRequestOptions extends BundleRequestOptions {
  filePath: string;
}

export interface WorkspaceCreateOptions extends ServerRequestOptions {
  slug: string;
  name: string;
  description?: string;
}

export interface WorkspaceDeleteOptions extends ServerRequestOptions {
  slug: string;
}

function buildEndpoint(baseUrl: string, apiPath: string): string {
  return `${baseUrl.replace(/\/$/, "")}${apiPath}`;
}

async function parseErrorResponse(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) {
    return res.statusText;
  }

  try {
    const json = JSON.parse(text) as { error?: string } | null;
    if (json?.error) {
      return json.error;
    }
  } catch {
    // Fall through to the raw body text below.
  }

  return text;
}

async function request(
  apiPath: string,
  opts: ServerRequestOptions,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${opts.apiKey}`);

  const res = await fetch(buildEndpoint(opts.url, apiPath), {
    ...init,
    headers,
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res);
    throw new Error(`Request failed (${res.status}): ${message}`);
  }

  return res;
}

async function requestJson<T>(
  apiPath: string,
  opts: ServerRequestOptions,
  init?: RequestInit
): Promise<T> {
  const res = await request(apiPath, opts, init);
  return res.json() as Promise<T>;
}

async function requestBuffer(apiPath: string, opts: ServerRequestOptions): Promise<Buffer> {
  const res = await request(apiPath, opts);
  return Buffer.from(await res.arrayBuffer());
}

async function requestVoid(
  apiPath: string,
  opts: ServerRequestOptions,
  init?: RequestInit
): Promise<void> {
  await request(apiPath, opts, init);
}

export async function uploadBundle(opts: UploadOptions): Promise<UploadResult> {
  const endpoint = buildEndpoint(opts.url, `/api/w/${encodeURIComponent(opts.workspace)}/bundle`);

  const fileBuffer = fs.readFileSync(opts.filePath);
  const filename = path.basename(opts.filePath);

  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "application/zip" }), filename);
  if (opts.bundleId) {
    form.append("bundleId", opts.bundleId);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(`Upload failed (${res.status}): ${body.error ?? res.statusText}`);
  }

  const data = await res.json() as { bundle?: { bundleId?: string }; bundleId?: string };
  // API may return { bundle: { bundleId } } or { bundleId } depending on version
  const bundleId = data.bundle?.bundleId ?? data.bundleId;
  if (!bundleId) {
    throw new Error("Upload succeeded but server did not return a bundleId");
  }
  return { bundleId };
}

export async function listBundles(
  opts: ServerRequestOptions & { workspace: string }
): Promise<{ bundles: BundleSummary[] }> {
  return requestJson(`/api/w/${encodeURIComponent(opts.workspace)}/bundle`, opts);
}

export async function listWorkspaces(
  opts: ServerRequestOptions
): Promise<{ workspaces: WorkspaceSummary[] }> {
  return requestJson("/api/w", opts);
}

export async function createWorkspace(
  opts: WorkspaceCreateOptions
): Promise<{ workspace: WorkspaceSummary }> {
  const body: { slug: string; name: string; description?: string } = {
    slug: opts.slug,
    name: opts.name,
  };
  if (opts.description !== undefined) {
    body.description = opts.description;
  }

  return requestJson("/api/w", opts, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function deleteWorkspace(
  opts: WorkspaceDeleteOptions
): Promise<{ success: true }> {
  return requestJson(`/api/w/${encodeURIComponent(opts.slug)}`, opts, {
    method: "DELETE",
  });
}

export async function getBundleMeta(opts: BundleRequestOptions): Promise<BundleMeta> {
  return requestJson(
    `/api/w/${encodeURIComponent(opts.workspace)}/bundles/${encodeURIComponent(opts.bundleId)}/meta`,
    opts
  );
}

export async function getBundleTree(opts: BundleRequestOptions): Promise<{ tree: TreeNode[] }> {
  return requestJson(
    `/api/w/${encodeURIComponent(opts.workspace)}/bundles/${encodeURIComponent(opts.bundleId)}/tree`,
    opts
  );
}

export async function deleteBundle(opts: BundleRequestOptions): Promise<void> {
  await requestVoid(
    `/api/w/${encodeURIComponent(opts.workspace)}/bundles/${encodeURIComponent(opts.bundleId)}`,
    opts,
    { method: "DELETE" }
  );
}

export async function downloadBundleFile(
  opts: BundleFileRequestOptions
): Promise<{ content: Buffer }> {
  const content = await requestBuffer(
    `/api/w/${encodeURIComponent(opts.workspace)}/bundles/${encodeURIComponent(
      opts.bundleId
    )}/file?path=${encodeURIComponent(opts.filePath)}`,
    opts
  );
  return { content };
}
