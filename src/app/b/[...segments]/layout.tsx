import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { parseSegments } from "@/lib/url";
import { extractBundle } from "@/lib/bundle/extractor";
import { BundleNotFoundError } from "@/lib/bundle/types";
import { Header } from "@/components/layout/header";
import { AppShell, MobileSidebarTrigger } from "@/components/layout/app-shell";
import { TreeProvider, FileTree } from "@/components/file-tree";
import type { TreeNode } from "@/lib/bundle/types";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ segments: string[] }>;
}

/** Collect first-level directory paths for initial expansion */
function getFirstLevelDirs(tree: TreeNode[]): string[] {
  return tree
    .filter((node) => node.type === "directory")
    .map((node) => node.path);
}

export default async function BundleLayout({ children, params }: LayoutProps) {
  const { segments } = await params;
  const { bundleId, filePath } = parseSegments(segments);

  const session = await auth();
  const userName =
    session?.user?.name ??
    (process.env.AUTH_BYPASS === "true" ? "dev" : null);

  let cacheEntry;
  try {
    cacheEntry = await extractBundle(bundleId);
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
      currentFilePath={filePath}
      initialExpandedPaths={initialExpanded}
    >
      <FileTree tree={fileTree} />
    </TreeProvider>
  );

  return (
    <div className="flex h-screen flex-col">
      <Header
        title={manifest.title}
        filePath={filePath}
        userName={userName}
        mobileTrigger={<MobileSidebarTrigger sidebar={sidebar} />}
      />
      <AppShell sidebar={sidebar} filePath={filePath}>
        {children}
      </AppShell>
    </div>
  );
}
