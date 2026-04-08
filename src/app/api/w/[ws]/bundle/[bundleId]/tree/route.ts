import { NextRequest, NextResponse } from "next/server";
import { extractBundle } from "@/lib/bundle/extractor";
import { storageKey } from "@/lib/url";
import { BundleNotFoundError } from "@/lib/bundle/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ws: string; bundleId: string }> }
) {
  const { ws, bundleId: rawBundleId } = await params;
  const bundleId = decodeURIComponent(rawBundleId);
  const key = storageKey(ws, bundleId);

  try {
    const entry = await extractBundle(key);
    return NextResponse.json({ tree: entry.fileTree });
  } catch (err) {
    if (err instanceof BundleNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("Bundle tree error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
