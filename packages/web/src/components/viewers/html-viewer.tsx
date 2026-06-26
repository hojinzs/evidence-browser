"use client";

import { useState } from "react";
import { viewerApiBundleUrl } from "@/lib/url";
import { CodeViewer } from "./code-viewer";

interface HtmlViewerProps {
  workspaceSlug: string;
  bundleId: string;
  shareToken?: string | null;
  filePath: string;
  content: string;
}

type HtmlMode = "preview" | "source";

export function HtmlViewer({ workspaceSlug, bundleId, shareToken, filePath, content }: HtmlViewerProps) {
  const [mode, setMode] = useState<HtmlMode>("preview");
  const previewUrl = `${viewerApiBundleUrl({ workspaceSlug, bundleId, shareToken }, "preview")}?path=${encodeURIComponent(filePath)}`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {filePath}
        </span>
        <div className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border border-border bg-background p-0.5">
          <button
            type="button"
            className={`rounded px-3 text-xs font-medium transition-colors ${
              mode === "preview"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-white/6 hover:text-foreground"
            }`}
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            className={`rounded px-3 text-xs font-medium transition-colors ${
              mode === "source"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-white/6 hover:text-foreground"
            }`}
            aria-pressed={mode === "source"}
            onClick={() => setMode("source")}
          >
            Source
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <iframe
          title={`HTML preview: ${filePath}`}
          src={previewUrl}
          sandbox=""
          referrerPolicy="no-referrer"
          className="h-[72vh] min-h-[480px] w-full bg-white"
        />
      ) : (
        <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
          <CodeViewer content={content} filePath={filePath} language="html" />
        </div>
      )}
    </div>
  );
}
