"use client";

import { apiBundleUrl } from "@/lib/url";

interface ImageViewerProps {
  workspaceSlug: string;
  bundleId: string;
  filePath: string;
}

export function ImageViewer({ workspaceSlug, bundleId, filePath }: ImageViewerProps) {
  const src = `${apiBundleUrl(workspaceSlug, bundleId, "file")}?path=${encodeURIComponent(filePath)}`;
  const fileName = filePath.includes("/")
    ? filePath.slice(filePath.lastIndexOf("/") + 1)
    : filePath;

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={fileName}
          className="max-w-full max-h-[70vh] object-contain"
        />
      </div>
      <p className="text-sm text-muted-foreground font-mono">{filePath}</p>
    </div>
  );
}
