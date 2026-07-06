import { isValidBundleId } from "./bundle/upload-validation";

export interface ParsedSegments {
  bundleId: string;
  filePath: string | null;
}

export function parseSegments(segments: string[]): ParsedSegments {
  if (segments.length === 0) {
    return { bundleId: "", filePath: null };
  }

  const [bundleId, marker, ...rest] = segments;
  if (marker !== "f") {
    return { bundleId, filePath: null };
  }

  return {
    bundleId,
    filePath: rest.join("/") || null,
  };
}

export function bundleFileUrl(workspace: string, bundleId: string, filePath: string): string {
  return `/w/${workspace}/b/${bundleId}/f?path=${encodeURIComponent(filePath)}`;
}

export function bundleLandingUrl(workspace: string, bundleId: string): string {
  return `/w/${workspace}/b/${bundleId}`;
}

export function shareFileUrl(token: string, filePath: string): string {
  return `${shareLandingUrl(token)}/f?path=${encodeURIComponent(filePath)}`;
}

export function shareLandingUrl(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}

export function workspaceUrl(workspace: string): string {
  return `/w/${workspace}`;
}

export function apiBundleUrl(
  workspace: string,
  bundleId: string,
  endpoint: "meta" | "tree" | "file" | "preview"
): string {
  return `/api/w/${workspace}/bundles/${bundleId}/${endpoint}`;
}

export function apiShareUrl(
  token: string,
  endpoint: "meta" | "tree" | "file" | "preview"
): string {
  return `/api/s/${encodeURIComponent(token)}/${endpoint}`;
}

export function storageKey(workspace: string, bundleId: string): string {
  if (!workspace || workspace.includes("..") || workspace.includes("/") || workspace.includes("\\") || workspace.includes("\0")) {
    throw new Error("Invalid workspace identifier");
  }
  if (!isValidBundleId(bundleId)) {
    throw new Error("Invalid bundle identifier");
  }
  return `${workspace}/${bundleId}`;
}
