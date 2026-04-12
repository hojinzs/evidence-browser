import { NextRequest, NextResponse } from "next/server";
import { validateSessionFromRequest } from "@/lib/auth/require-auth";
import { getStorageAdapter } from "@/lib/storage";
import { getEnv } from "@/config/env";

export async function POST(request: NextRequest) {
  const user = validateSessionFromRequest(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const env = getEnv();
    const adapter = getStorageAdapter();

    // Try listing bundles (or just check the adapter is constructible)
    let bundles: string[] = [];
    if (adapter.listBundles) {
      bundles = await adapter.listBundles();
    }

    return NextResponse.json({
      ok: true,
      storageType: env.STORAGE_TYPE,
      bundleCount: bundles.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Storage connection failed",
      },
      { status: 400 }
    );
  }
}
