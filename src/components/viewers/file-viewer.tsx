"use client";

import { detectFileType } from "@/lib/files/detect";
import { MarkdownViewer } from "./markdown-viewer";
import { CodeViewer } from "./code-viewer";
import { ImageViewer } from "./image-viewer";
import { TextViewer } from "./text-viewer";
import { DownloadFallback } from "./download-fallback";
import { getShikiLanguage } from "@/lib/files/detect";

interface FileViewerProps {
  workspaceSlug: string;
  bundleId: string;
  filePath: string;
  content?: string;
  isBinary?: boolean;
}

export function FileViewer({
  workspaceSlug,
  bundleId,
  filePath,
  content,
  isBinary,
}: FileViewerProps) {
  if (isBinary || content === undefined) {
    const fileType = detectFileType(filePath);
    if (fileType === "image") {
      return <ImageViewer workspaceSlug={workspaceSlug} bundleId={bundleId} filePath={filePath} />;
    }
    return <DownloadFallback workspaceSlug={workspaceSlug} bundleId={bundleId} filePath={filePath} />;
  }

  const fileType = detectFileType(filePath);

  switch (fileType) {
    case "markdown":
      return (
        <MarkdownViewer
          content={content}
          workspaceSlug={workspaceSlug}
          bundleId={bundleId}
          currentFilePath={filePath}
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
      return <ImageViewer workspaceSlug={workspaceSlug} bundleId={bundleId} filePath={filePath} />;
    case "text":
      return <TextViewer content={content} />;
    default:
      return <DownloadFallback workspaceSlug={workspaceSlug} bundleId={bundleId} filePath={filePath} />;
  }
}
