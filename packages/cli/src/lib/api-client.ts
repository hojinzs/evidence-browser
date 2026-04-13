import fs from "fs";
import path from "path";

export interface UploadOptions {
  filePath: string;
  url: string;
  workspace: string;
  apiKey: string;
  bundleId?: string;
}

export interface UploadResult {
  bundleId: string;
}

export async function uploadBundle(opts: UploadOptions): Promise<UploadResult> {
  const endpoint = `${opts.url.replace(/\/$/, "")}/api/w/${opts.workspace}/bundle`;

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
