import { NextRequest, NextResponse } from "next/server";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { listBundles, createBundle } from "@/lib/db/bundles";
import {
  requireAuthFromRequest,
  requireAdminFromRequest,
} from "@/lib/auth/require-auth";
import { getStorageAdapter } from "@/lib/storage";
import { storageKey } from "@/lib/url";
import { validateBundleZip } from "@/lib/bundle/extractor";
import { getEnv } from "@/config/env";
import path from "path";
import fs from "fs";
import os from "os";

interface RouteParams {
  params: Promise<{ ws: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const authResult = requireAuthFromRequest(request);
  if (authResult instanceof Response) return authResult;

  const { ws } = await params;
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const bundles = listBundles(workspace.id);
  return NextResponse.json({ bundles });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const authResult = requireAdminFromRequest(request);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { ws } = await params;
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || !file.name.endsWith(".zip")) {
    return NextResponse.json({ error: "A .zip file is required" }, { status: 400 });
  }

  const env = getEnv();
  if (file.size > env.MAX_BUNDLE_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${env.MAX_BUNDLE_SIZE} bytes)` },
      { status: 413 }
    );
  }

  // Read file into buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save to temp to validate
  const tmpDir = path.join(os.tmpdir(), "evidence-upload-" + Date.now());
  const tmpZip = path.join(tmpDir, "upload.zip");
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    fs.writeFileSync(tmpZip, buffer);

    // Derive bundle ID from filename (strip .zip)
    const bundleId = (formData.get("bundleId") as string)
      || file.name.replace(/\.zip$/, "");

    if (!bundleId || bundleId.includes("..") || bundleId.includes("/") || bundleId.includes("\0")) {
      return NextResponse.json({ error: "Invalid bundleId" }, { status: 400 });
    }

    const key = storageKey(ws, bundleId);

    // Validate manifest before storing
    let title: string | null = null;
    try {
      const validated = await validateBundleZip(tmpZip);
      title = validated.title;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "번들 검증 실패" },
        { status: 400 }
      );
    }

    // Store the bundle
    const storage = getStorageAdapter();
    if (!storage.putBundle) {
      return NextResponse.json(
        { error: "Storage adapter does not support upload" },
        { status: 501 }
      );
    }
    await storage.putBundle(key, buffer);

    // Record in DB
    const bundle = createBundle({
      bundleId,
      workspaceId: workspace.id,
      title,
      storageKey: key,
      sizeBytes: file.size,
      uploadedBy: user.id,
    });

    return NextResponse.json({ bundle }, { status: 201 });
  } finally {
    // Cleanup temp
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
