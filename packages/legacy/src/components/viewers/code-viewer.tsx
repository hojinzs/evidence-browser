"use client";

import { useEffect, useState } from "react";
import { codeToHtml } from "shiki/bundle/web";

interface CodeViewerProps {
  content: string;
  filePath: string;
  language?: string;
}

export function CodeViewer({ content, filePath, language }: CodeViewerProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    codeToHtml(content, {
      lang: language || "text",
      theme: "github-dark",
    })
      .then((html) => {
        if (!cancelled) {
          setHighlightedHtml(html);
          setIsLoading(false);
        }
      })
      .catch(() => {
        // Fallback: if language is unsupported, try with "text"
        if (!cancelled) {
          codeToHtml(content, { lang: "text", theme: "github-dark" })
            .then((html) => {
              if (!cancelled) {
                setHighlightedHtml(html);
                setIsLoading(false);
              }
            })
            .catch(() => {
              if (!cancelled) {
                setHighlightedHtml("");
                setIsLoading(false);
              }
            });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content, language]);

  const fileName = filePath.includes("/")
    ? filePath.slice(filePath.lastIndexOf("/") + 1)
    : filePath;

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="font-mono">{fileName}</span>
          {language && (
            <span className="ml-auto rounded bg-white/6 px-1.5 py-0.5 uppercase">
              {language}
            </span>
          )}
        </div>
        <div className="p-4">
          <pre className="font-mono text-sm whitespace-pre overflow-x-auto text-muted-foreground">
            {content}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="font-mono">{fileName}</span>
        {language && (
          <span className="ml-auto rounded bg-white/6 px-1.5 py-0.5 uppercase">
            {language}
          </span>
        )}
      </div>
      <div
        className="overflow-x-auto [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!p-4 [&_pre]:text-sm [&_code]:!text-sm [&_.line]:before:content-[counter(line-number)] [&_.line]:before:counter-increment-[line-number] [&_.line]:before:inline-block [&_.line]:before:w-8 [&_.line]:before:mr-4 [&_.line]:before:text-right [&_.line]:before:text-gray-400"
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </div>
  );
}
