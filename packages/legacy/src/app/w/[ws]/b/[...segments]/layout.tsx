import { notFound } from "next/navigation";
import { getOptionalAuth } from "@/lib/auth/require-auth";
import { parseSegments, storageKey } from "@/lib/url";
import { extractBundle } from "@/lib/bundle/extractor";
import { BundleNotFoundError } from "@/lib/bundle/types";
import { Header } from "@/components/layout/header";
import { AppShell, MobileSidebarTrigger } from "@/components/layout/app-shell";
import { TreeProvider, FileTree } from "@/components/file-tree";
import type { TreeNode } from "@/lib/bundle/types";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ ws: string; segments: string[] }>;
}

function getFirstLevelDirs(tree: TreeNode[]): string[] {
  return tree
    .filter((node) => node.type === "directory")
    .map((node) => node.path);
}

export default async function BundleLayout({ children, params }: LayoutProps) {
  const { ws, segments } = await params;
  const { bundleId, filePath } = parseSegments(segments);
  const key = storageKey(ws, bundleId);

  const user = await getOptionalAuth();
  const userName = user?.username ?? null;

  let cacheEntry;
  try {
    cacheEntry = await extractBundle(key);
  } catch (error) {
    if (error instanceof BundleNotFoundError) {
      notFound();
    }
    throw error;
  }

  const { manifest, fileTree } = cacheEntry;
  const initialExpanded = getFirstLevelDirs(fileTree);

  const sidebar = (
    <TreeProvider
      bundleId={bundleId}
      workspaceSlug={ws}
      currentFilePath={filePath}
      initialExpandedPaths={initialExpanded}
    >
      <FileTree tree={fileTree} bundleId={manifest.title} />
    </TreeProvider>
  );

  return (
    <div className="flex h-screen flex-col">
      <Header
        title={ws}
        filePath={filePath}
        userName={userName}
        mobileTrigger={<MobileSidebarTrigger sidebar={sidebar} />}
        nav={<span className="text-[13px] text-muted-foreground">{bundleId}</span>}
      />
      <AppShell sidebar={sidebar} filePath={filePath}>
        <div className="app-fade-up page-frame max-w-none px-4 py-8 lg:px-8">{children}</div>
      </AppShell>
    </div>
  );
}
