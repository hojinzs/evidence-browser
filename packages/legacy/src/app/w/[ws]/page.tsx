export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { findWorkspaceBySlug } from "@/lib/db/workspaces";
import { listBundles } from "@/lib/db/bundles";
import { getOptionalAuth } from "@/lib/auth/require-auth";
import { bundleLandingUrl } from "@/lib/url";
import { BundleCard } from "@/components/bundle/bundle-card";
import { UploadForm } from "@/components/bundle/upload-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/layout";

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
      <Header
        title={workspace.name}
        userName={user?.username}
        nav={
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground"
          >
            ← Workspaces
          </Link>
        }
      />

      <main className="app-fade-up page-frame py-12">
        <div className="mb-6 flex items-end gap-6">
          <div>
            <h2 className="text-[20px] font-semibold">{workspace.name}</h2>
            {workspace.description && (
              <p className="mt-1 text-[13px] text-muted-foreground">{workspace.description}</p>
            )}
          </div>
          <div className="h-px flex-1 bg-border" />
          <Badge variant="neutral">{bundles.length} bundles</Badge>
        </div>

        <div className="space-y-8">
        {isAdmin && <UploadForm workspaceSlug={ws} />}

          <section>
            <h3 className="mb-3 text-lg font-semibold">Recent Bundles</h3>
            {bundles.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">아직 번들이 없습니다</Card>
            ) : (
              <Card className="overflow-hidden p-0">
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
              </Card>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
