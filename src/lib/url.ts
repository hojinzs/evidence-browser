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

export function bundleFileUrl(bundleId: string, filePath: string): string {
  return `/b/${bundleId}/f/${filePath}`;
}

export function bundleLandingUrl(bundleId: string): string {
  return `/b/${bundleId}`;
}

export function apiBundleUrl(
  bundleId: string,
  endpoint: "meta" | "tree" | "file"
): string {
  return `/api/bundle/${encodeBundleId(bundleId)}/${endpoint}`;
}
