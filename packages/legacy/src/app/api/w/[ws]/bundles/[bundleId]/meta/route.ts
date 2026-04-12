import { NextRequest, NextResponse } from "next/server";
import { extractBundle } from "@/lib/bundle/extractor";
import { storageKey } from "@/lib/url";
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
  { params }: { params: Promise<{ ws: string; bundleId: string }> }
) {
  const { ws, bundleId: rawBundleId } = await params;
  const bundleId = decodeURIComponent(rawBundleId);
  const key = storageKey(ws, bundleId);

  try {
    const entry = await extractBundle(key);
    return NextResponse.json({
      manifest: entry.manifest,
      tree: entry.fileTree,
    });
  } catch (err) {
    if (err instanceof BundleNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof BundleSizeLimitError || err instanceof FileCountLimitError) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    if (
      err instanceof ManifestNotFoundError ||
      err instanceof ManifestValidationError ||
      err instanceof IndexFileNotFoundError
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Bundle meta error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
