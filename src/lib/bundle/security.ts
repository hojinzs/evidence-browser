import path from "path";

export function validatePathSafety(filePath: string): boolean {
  if (filePath.includes("..")) return false;
  if (path.isAbsolute(filePath)) return false;
  if (filePath.includes("\0")) return false;
  if (filePath.startsWith("/")) return false;
  return true;
}

export function ensureWithinRoot(root: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(root) + path.sep;
  const resolvedTarget = path.resolve(root, targetPath);
  return resolvedTarget.startsWith(resolvedRoot) || resolvedTarget === path.resolve(root);
}
