export interface Manifest {
  version: number;
  title: string;
  index: string;
  [key: string]: unknown;
}

export interface TreeNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: TreeNode[];
}

export type ApiKeyScope = "read" | "upload" | "admin";

export function bundleLandingUrl(workspace: string, bundleId: string): string;
export function apiBundleUrl(
  workspace: string,
  bundleId: string,
  endpoint: "meta" | "tree" | "file" | "preview"
): string;
