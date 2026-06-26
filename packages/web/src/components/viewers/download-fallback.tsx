"use client";

import { FileQuestion, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { viewerApiBundleUrl } from "@/lib/url";

interface DownloadFallbackProps {
  workspaceSlug: string;
  bundleId: string;
  shareToken?: string | null;
  filePath: string;
}

export function DownloadFallback({ workspaceSlug, bundleId, shareToken, filePath }: DownloadFallbackProps) {
  const downloadUrl = `${viewerApiBundleUrl({ workspaceSlug, bundleId, shareToken }, "file")}?path=${encodeURIComponent(filePath)}`;
  const fileName = filePath.includes("/")
    ? filePath.slice(filePath.lastIndexOf("/") + 1)
    : filePath;

  return (
    <div className="surface-card flex flex-col items-center justify-center gap-6 py-16">
      <FileQuestion className="size-16 text-muted-foreground/50" />
      <div className="text-center space-y-2">
        <p className="text-muted-foreground">
          미리보기를 지원하지 않는 파일입니다
        </p>
        <p className="text-sm text-muted-foreground/70 font-mono">{fileName}</p>
      </div>
      <a href={downloadUrl} download={fileName}>
        <Button variant="outline">
          <Download className="size-4 mr-2" />
          다운로드
        </Button>
      </a>
    </div>
  );
}
