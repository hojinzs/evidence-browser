import { notFound } from "next/navigation";
import Link from "next/link";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { listBundles } from "@/lib/db/bundles";
import { getOptionalAuth } from "@/lib/auth/require-auth";
import { bundleLandingUrl } from "@/lib/url";
import { BundleCard } from "@/components/bundle/bundle-card";
import { UploadForm } from "@/components/bundle/upload-form";
import { ArrowLeft, Package } from "lucide-react";

interface PageProps {
  params: Promise<{ ws: string }>;
}

export default async function WorkspacePage({ params }: PageProps) {
  const { ws } = await params;
  const workspace = findWorkspaceBySlug(ws);
  if (!workspace) {
    notFound();
  }

  const user = await getOptionalAuth();
  const bundles = listBundles(workspace.id);
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold">{workspace.name}</h1>
              {workspace.description && (
                <p className="text-sm text-muted-foreground">{workspace.description}</p>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{user?.username}</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 lg:p-6 space-y-6">
        {isAdmin && <UploadForm workspaceSlug={ws} />}

        {bundles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="size-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">아직 번들이 없습니다</p>
            {isAdmin && (
              <p className="text-sm text-muted-foreground mt-1">
                위의 업로드 영역에 ZIP 파일을 드래그하세요
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              번들 ({bundles.length})
            </h2>
            <div className="grid gap-2">
              {bundles.map((bundle) => (
                <BundleCard
                  key={bundle.id}
                  title={bundle.title || bundle.bundle_id}
                  bundleId={bundle.bundle_id}
                  href={bundleLandingUrl(ws, bundle.bundle_id)}
                  uploadedBy={bundle.uploader_username}
                  createdAt={bundle.created_at}
                  sizeBytes={bundle.size_bytes}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
