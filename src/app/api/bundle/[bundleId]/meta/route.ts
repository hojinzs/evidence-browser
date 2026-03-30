import { NextRequest, NextResponse } from "next/server";
import { extractBundle, setTreePaths } from "@/lib/bundle/extractor";
import {
  BundleNotFoundError,
  BundleSizeLimitError,
  ManifestNotFoundError,
  ManifestValidationError,
  IndexFileNotFoundError,
  FileCountLimitError,
} from "@/lib/bundle/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  const { bundleId: rawBundleId } = await params;
  const bundleId = decodeURIComponent(rawBundleId);

  try {
    const entry = await extractBundle(bundleId);
    return NextResponse.json({
      manifest: entry.manifest,
      tree: entry.fileTree,
    });
  } catch (err) {
    if (err instanceof BundleNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof BundleSizeLimitError) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    if (
      err instanceof ManifestNotFoundError ||
      err instanceof ManifestValidationError ||
      err instanceof IndexFileNotFoundError
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof FileCountLimitError) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    console.error("Bundle meta error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
