import type { FileType } from "./types";

const EXTENSION_MAP: Record<string, FileType> = {
  // Markdown
  ".md": "markdown",
  ".mdx": "markdown",
  // Image
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",
  ".ico": "image",
  // Code
  ".ts": "code",
  ".tsx": "code",
  ".js": "code",
  ".jsx": "code",
  ".py": "code",
  ".rb": "code",
  ".go": "code",
  ".rs": "code",
  ".java": "code",
  ".kt": "code",
  ".swift": "code",
  ".css": "code",
  ".scss": "code",
  ".html": "code",
  ".xml": "code",
  ".yaml": "code",
  ".yml": "code",
  ".toml": "code",
  ".sh": "code",
  ".bash": "code",
  ".sql": "code",
  ".graphql": "code",
  ".json": "code",
  ".jsonl": "code",
  ".dockerfile": "code",
  // Text
  ".txt": "text",
  ".log": "text",
  ".csv": "text",
  ".env": "text",
};

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function extname(filePath: string): string {
  const name = basename(filePath);
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(lastDot).toLowerCase() : "";
}

export function detectFileType(filePath: string): FileType {
  const ext = extname(filePath);
  // Special case: Dockerfile
  if (basename(filePath).toLowerCase() === "dockerfile") return "code";
  return EXTENSION_MAP[ext] ?? "binary";
}

export function getMimeType(filePath: string): string {
  const ext = extname(filePath);
  return MIME_MAP[ext] ?? "text/plain; charset=utf-8";
}

export function getShikiLanguage(filePath: string): string | undefined {
  const ext = extname(filePath);
  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".py": "python",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".swift": "swift",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sh": "bash",
    ".bash": "bash",
    ".sql": "sql",
    ".graphql": "graphql",
    ".json": "json",
    ".jsonl": "json",
    ".dockerfile": "dockerfile",
    ".md": "markdown",
  };
  if (basename(filePath).toLowerCase() === "dockerfile") return "dockerfile";
  return langMap[ext];
}
