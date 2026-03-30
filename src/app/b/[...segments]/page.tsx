import { notFound } from "next/navigation";
import { parseSegments } from "@/lib/url";
import { extractBundle, getFileContent } from "@/lib/bundle/extractor";
import { detectFileType } from "@/lib/files/detect";
import { BundleNotFoundError } from "@/lib/bundle/types";
import { FileViewer } from "@/components/viewers/file-viewer";
import { MarkdownViewer } from "@/components/viewers/markdown-viewer";

interface PageProps {
  params: Promise<{ segments: string[] }>;
}

export default async function BundlePage({ params }: PageProps) {
  const { segments } = await params;
  const { bundleId, filePath } = parseSegments(segments);

  let cacheEntry;
  try {
    cacheEntry = await extractBundle(bundleId);
  } catch (error) {
    if (error instanceof BundleNotFoundError) {
      notFound();
    }
    throw error;
  }

  const { cacheDir, manifest } = cacheEntry;

  // Landing page: show the index file
  if (!filePath) {
    try {
      const indexBuffer = await getFileContent(cacheDir, manifest.index);
      const indexContent = indexBuffer.toString("utf-8");
      return (
        <MarkdownViewer
          content={indexContent}
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

  // File view
  try {
    const fileType = detectFileType(filePath);

    // Binary files (images etc.) don't need content read
    if (fileType === "binary" || fileType === "image") {
      return (
        <FileViewer
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
        bundleId={bundleId}
        filePath={filePath}
        content={content}
      />
    );
  } catch {
    notFound();
  }
}
