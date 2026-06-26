export {
  apiBundleUrl,
  bundleFileUrl,
  bundleLandingUrl,
  parseSegments,
  storageKey,
  workspaceUrl,
} from "@evidence-browser/shared/url";
export type { ParsedSegments } from "@evidence-browser/shared/url";

export interface BundleUrlContext {
  workspaceSlug: string;
  bundleId: string;
  shareToken?: string | null;
}

export type BundleApiEndpoint = "meta" | "tree" | "file" | "preview";

export function shareLandingUrl(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}

export function shareFileUrl(token: string, filePath: string): string {
  return `${shareLandingUrl(token)}/f?path=${encodeURIComponent(filePath)}`;
}

export function apiShareBundleUrl(token: string, endpoint: BundleApiEndpoint): string {
  return `/api/s/${encodeURIComponent(token)}/${endpoint}`;
}

export function viewerBundleFileUrl(
  { workspaceSlug, bundleId, shareToken }: BundleUrlContext,
  filePath: string
): string {
  if (shareToken) return shareFileUrl(shareToken, filePath);
  return `/w/${workspaceSlug}/b/${bundleId}/f?path=${encodeURIComponent(filePath)}`;
}

export function viewerApiBundleUrl(
  { workspaceSlug, bundleId, shareToken }: BundleUrlContext,
  endpoint: BundleApiEndpoint
): string {
  if (shareToken) return apiShareBundleUrl(shareToken, endpoint);
  return `/api/w/${workspaceSlug}/bundles/${bundleId}/${endpoint}`;
}
