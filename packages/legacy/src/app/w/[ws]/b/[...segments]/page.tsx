import { notFound } from "next/navigation";
import { parseSegments, storageKey } from "@/lib/url";
import { extractBundle, getFileContent } from "@/lib/bundle/extractor";
import { detectFileType } from "@/lib/files/detect";
import { BundleNotFoundError } from "@/lib/bundle/types";
import { FileViewer } from "@/components/viewers/file-viewer";
import { MarkdownViewer } from "@/components/viewers/markdown-viewer";

interface PageProps {
  params: Promise<{ ws: string; segments: string[] }>;
  searchParams: Promise<{ path?: string }>;
}

export default async function BundlePage({ params, searchParams }: PageProps) {
  const { ws, segments } = await params;
  const { bundleId, filePath: pathFromSegments } = parseSegments(segments);
  const search = await searchParams;
  const filePath = search.path ?? pathFromSegments;
  const key = storageKey(ws, bundleId);

  let cacheEntry;
  try {
    cacheEntry = await extractBundle(key);
  } catch (error) {
    if (error instanceof BundleNotFoundError) {
      notFound();
    }
    throw error;
  }

  const { cacheDir, manifest } = cacheEntry;

  if (!filePath) {
    try {
      const indexBuffer = await getFileContent(cacheDir, manifest.index);
      const indexContent = indexBuffer.toString("utf-8");
      return (
        <MarkdownViewer
          content={indexContent}
          workspaceSlug={ws}
          bundleId={bundleId}
          currentFilePath={manifest.index}
        />
      );
    } catch {
      return (
        <div className="py-8 text-center text-muted-foreground">
          <p>인덱스 파일을 찾을 수 없습니다.</p>
        </div>
      );
    }
  }

  try {
    const fileType = detectFileType(filePath);

    if (fileType === "binary" || fileType === "image") {
      return (
        <FileViewer
          workspaceSlug={ws}
          bundleId={bundleId}
          filePath={filePath}
          isBinary={fileType === "binary"}
        />
      );
    }

    const buffer = await getFileContent(cacheDir, filePath);
    const content = buffer.toString("utf-8");

    return (
      <FileViewer
        workspaceSlug={ws}
        bundleId={bundleId}
        filePath={filePath}
        content={content}
      />
    );
  } catch {
    notFound();
  }
}
