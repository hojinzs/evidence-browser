import archiver from "archiver";
import fs from "fs";
import path from "path";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const OUTPUT_DIR = path.resolve(
  process.env.STORAGE_LOCAL_PATH || "./data/bundles"
);

// Default workspace slug for seeded bundles
const DEFAULT_WS = "default";

const FIXTURE_MAP: Record<string, string> = {
  "fixture-basic": "basic",
  "fixture-deep": "deep",
  "fixture-large-tree": "large-tree",
  "fixture-markdown-rich": "markdown-rich",
  "fixture-invalid-manifest": "invalid-manifest",
  "fixture-no-manifest": "no-manifest",
  "fixture-no-index": "no-index",
  "fixture-binary": "binary",
  "fixture-security": "security",
  "fixture-unicode": "unicode",
};

async function createZip(
  sourceDir: string,
  outputPath: string
): Promise<void> {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function main() {
  console.log("Creating seed bundles...\n");
  console.log(`  Output directory: ${OUTPUT_DIR}`);
  console.log(`  Workspace: ${DEFAULT_WS}\n`);

  const entries = Object.entries(FIXTURE_MAP);

  for (const [fixtureName, bundleId] of entries) {
    const sourceDir = path.join(FIXTURES_DIR, fixtureName);
    if (!fs.existsSync(sourceDir)) {
      console.warn(`  SKIP: ${fixtureName} (directory not found)`);
      continue;
    }

    // Store under workspace prefix: default/{bundleId}.zip
    const outputPath = path.join(OUTPUT_DIR, DEFAULT_WS, `${bundleId}.zip`);
    await createZip(sourceDir, outputPath);
    console.log(`  OK: ${fixtureName} → ${outputPath}`);
  }

  // Also create a nested bundle ID test
  const basicSource = path.join(FIXTURES_DIR, "fixture-basic");
  const nestedPath = path.join(OUTPUT_DIR, DEFAULT_WS, "org/repo/pr-182/run-1.zip");
  await createZip(basicSource, nestedPath);
  console.log(`  OK: fixture-basic → ${nestedPath} (nested ID test)`);

  console.log("\nSeed complete!");
  console.log("\nTo use these bundles, create a workspace with slug 'default'");
  console.log("during the setup wizard, or via the admin panel.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
