import { NextRequest, NextResponse } from "next/server";
import { extractBundle, getFileContent } from "@/lib/bundle/extractor";
import { validatePathSafety, ensureWithinRoot } from "@/lib/bundle/security";
import { getMimeType } from "@/lib/files/detect";
import { BundleNotFoundError } from "@/lib/bundle/types";
import path from "path";

const CSP_HEADER =
  "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  const { bundleId: rawBundleId } = await params;
  const bundleId = decodeURIComponent(rawBundleId);
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json(
      { error: "Missing 'path' query parameter" },
      { status: 400 }
    );
  }

  // Security: validate path
  if (!validatePathSafety(filePath)) {
    return NextResponse.json(
      { error: "Invalid file path" },
      { status: 400 }
    );
  }

  try {
    const entry = await extractBundle(bundleId);
    const fullPath = path.join(entry.cacheDir, filePath);

    if (!ensureWithinRoot(entry.cacheDir, fullPath)) {
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 403 }
      );
    }

    const content = await getFileContent(entry.cacheDir, filePath);
    const mimeType = getMimeType(filePath);

    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": mimeType,
        "Content-Security-Policy": CSP_HEADER,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof BundleNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (
      err instanceof Error &&
      (err.message === "Invalid file path" ||
        err.message.includes("ENOENT"))
    ) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    console.error("Bundle file error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
