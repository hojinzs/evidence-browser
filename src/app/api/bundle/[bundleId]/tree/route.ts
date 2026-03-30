import { NextRequest, NextResponse } from "next/server";
import { extractBundle } from "@/lib/bundle/extractor";
import { BundleNotFoundError } from "@/lib/bundle/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  const { bundleId: rawBundleId } = await params;
  const bundleId = decodeURIComponent(rawBundleId);

  try {
    const entry = await extractBundle(bundleId);
    return NextResponse.json({ tree: entry.fileTree });
  } catch (err) {
    if (err instanceof BundleNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("Bundle tree error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
