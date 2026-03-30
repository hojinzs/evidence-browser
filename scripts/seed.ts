import archiver from "archiver";
import fs from "fs";
import path from "path";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const OUTPUT_DIR = path.resolve(
  process.env.STORAGE_LOCAL_PATH || "./data/bundles"
);

const FIXTURE_MAP: Record<string, string> = {
  "fixture-basic": "sample/basic",
  "fixture-deep": "sample/deep",
  "fixture-large-tree": "sample/large-tree",
  "fixture-markdown-rich": "sample/markdown-rich",
  "fixture-invalid-manifest": "sample/invalid-manifest",
  "fixture-no-manifest": "sample/no-manifest",
  "fixture-no-index": "sample/no-index",
  "fixture-binary": "sample/binary",
  "fixture-security": "sample/security",
  "fixture-unicode": "sample/unicode",
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

  const entries = Object.entries(FIXTURE_MAP);

  for (const [fixtureName, bundlePath] of entries) {
    const sourceDir = path.join(FIXTURES_DIR, fixtureName);
    if (!fs.existsSync(sourceDir)) {
      console.warn(`  SKIP: ${fixtureName} (directory not found)`);
      continue;
    }

    const outputPath = path.join(OUTPUT_DIR, `${bundlePath}.zip`);
    await createZip(sourceDir, outputPath);
    console.log(`  OK: ${fixtureName} → ${outputPath}`);
  }

  // Also create a nested bundle ID test: org/repo/pr-182/run-1
  const basicSource = path.join(FIXTURES_DIR, "fixture-basic");
  const nestedPath = path.join(OUTPUT_DIR, "org/repo/pr-182/run-1.zip");
  await createZip(basicSource, nestedPath);
  console.log(`  OK: fixture-basic → ${nestedPath} (nested ID test)`);

  console.log("\nSeed complete!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
