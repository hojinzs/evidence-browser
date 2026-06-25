/**
 * Evidence Bundle processor example.
 * Demonstrates TypeScript patterns used in the project.
 */

interface BundleManifest {
  version: number;
  title: string;
  index: string;
}

interface FileEntry {
  path: string;
  size: number;
  mimeType: string;
}

async function loadManifest(bundlePath: string): Promise<BundleManifest> {
  const raw = await Bun.file(`${bundlePath}/manifest.json`).text();
  return JSON.parse(raw) as BundleManifest;
}

export async function listFiles(bundlePath: string): Promise<FileEntry[]> {
  const manifest = await loadManifest(bundlePath);
  console.log(`Bundle: ${manifest.title} (v${manifest.version})`);
  // In a real implementation this would walk the bundle directory
  return [];
}
