import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ segments: string[] }>;
}

/**
 * Legacy redirect: /b/{bundleId} → /w/default/b/{bundleId}
 * Preserves old bookmarks for v0 installations.
 */
export default async function LegacyBundleRedirect({ params }: PageProps) {
  const { segments } = await params;
  redirect(`/w/default/b/${segments.join("/")}`);
}
