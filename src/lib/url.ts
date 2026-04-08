export interface ParsedSegments {
  bundleId: string;
  filePath: string | null;
}

export function parseSegments(segments: string[]): ParsedSegments {
  const fIndex = segments.indexOf("f");

  if (fIndex === -1) {
    return {
      bundleId: segments.join("/"),
      filePath: null,
    };
  }

  return {
    bundleId: segments.slice(0, fIndex).join("/"),
    filePath: segments.slice(fIndex + 1).join("/") || null,
  };
}

export function encodeBundleId(bundleId: string): string {
  return encodeURIComponent(bundleId);
}

export function bundleFileUrl(workspace: string, bundleId: string, filePath: string): string {
  return `/w/${workspace}/b/${bundleId}/f/${filePath}`;
}

export function bundleLandingUrl(workspace: string, bundleId: string): string {
  return `/w/${workspace}/b/${bundleId}`;
}

export function workspaceUrl(workspace: string): string {
  return `/w/${workspace}`;
}

export function apiBundleUrl(
  workspace: string,
  bundleId: string,
  endpoint: "meta" | "tree" | "file"
): string {
  return `/api/w/${workspace}/bundle/${encodeBundleId(bundleId)}/${endpoint}`;
}

/** Construct the storage key for a bundle within a workspace */
export function storageKey(workspace: string, bundleId: string): string {
  if (!workspace || workspace.includes("..") || workspace.includes("/") || workspace.includes("\0")) {
    throw new Error("Invalid workspace identifier");
  }
  if (!bundleId || bundleId.includes("..") || bundleId.includes("/") || bundleId.includes("\0")) {
    throw new Error("Invalid bundle identifier");
  }
  return `${workspace}/${bundleId}`;
}
