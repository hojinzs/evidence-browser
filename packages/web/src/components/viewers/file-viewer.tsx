"use client";

import { detectFileType, getShikiLanguage } from "@evidence-browser/shared/files/detect";
import { MarkdownViewer } from "./markdown-viewer";
import { CodeViewer } from "./code-viewer";
import { HtmlViewer } from "./html-viewer";
import { ImageViewer } from "./image-viewer";
import { TextViewer } from "./text-viewer";
import { DownloadFallback } from "./download-fallback";

interface FileViewerProps {
  workspaceSlug: string;
  bundleId: string;
  shareToken?: string | null;
  filePath: string;
  content?: string;
  isBinary?: boolean;
}

export function FileViewer({
  workspaceSlug,
  bundleId,
  shareToken,
  filePath,
  content,
  isBinary,
}: FileViewerProps) {
  if (isBinary || content === undefined) {
    const fileType = detectFileType(filePath);
    if (fileType === "image") {
      return <ImageViewer workspaceSlug={workspaceSlug} bundleId={bundleId} shareToken={shareToken} filePath={filePath} />;
    }
    return <DownloadFallback workspaceSlug={workspaceSlug} bundleId={bundleId} shareToken={shareToken} filePath={filePath} />;
  }

  const fileType = detectFileType(filePath);

  switch (fileType) {
    case "markdown":
      return (
        <MarkdownViewer
          content={content}
          workspaceSlug={workspaceSlug}
          bundleId={bundleId}
          shareToken={shareToken}
          currentFilePath={filePath}
        />
      );
    case "html":
      return (
        <HtmlViewer
          workspaceSlug={workspaceSlug}
          bundleId={bundleId}
          shareToken={shareToken}
          filePath={filePath}
          content={content}
        />
      );
    case "code":
      return (
        <CodeViewer
          content={content}
          filePath={filePath}
          language={getShikiLanguage(filePath)}
        />
      );
    case "image":
      return <ImageViewer workspaceSlug={workspaceSlug} bundleId={bundleId} shareToken={shareToken} filePath={filePath} />;
    case "text":
      return <TextViewer content={content} />;
    default:
      return <DownloadFallback workspaceSlug={workspaceSlug} bundleId={bundleId} shareToken={shareToken} filePath={filePath} />;
  }
}
