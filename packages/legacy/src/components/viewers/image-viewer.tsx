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
      <div className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={fileName}
          className="max-w-full max-h-[70vh] object-contain"
        />
      </div>
      <p className="font-mono text-sm text-muted-foreground">{filePath}</p>
    </div>
  );
}
