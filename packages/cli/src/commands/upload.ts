import { Command } from "commander";
import fs from "fs";
import path from "path";
import { uploadBundle } from "../lib/api-client";

export function registerUpload(program: Command): void {
  program
    .command("upload <file>")
    .description("Upload a bundle ZIP to an Evidence Browser instance")
    .requiredOption("--url <url>", "Base URL of the Evidence Browser instance (e.g. https://eb.example.com)")
    .requiredOption("--workspace <slug>", "Workspace slug")
    .requiredOption("--api-key <key>", "API key with upload or admin scope (eb_...)")
    .option("--bundle-id <id>", "Override bundle ID (default: derived from filename)")
    .action(async (file: string, opts: { url: string; workspace: string; apiKey: string; bundleId?: string }) => {
      const absPath = path.resolve(file);

      if (!fs.existsSync(absPath)) {
        console.error(`Error: File not found: ${absPath}`);
        process.exit(1);
      }
      if (!absPath.endsWith(".zip")) {
        console.error("Error: File must be a .zip");
        process.exit(1);
      }

      try {
        const result = await uploadBundle({
          filePath: absPath,
          url: opts.url,
          workspace: opts.workspace,
          apiKey: opts.apiKey,
          bundleId: opts.bundleId,
        });
        console.log(`Uploaded: ${result.bundleId}`);
        console.log(`  View: ${opts.url.replace(/\/$/, "")}/w/${opts.workspace}/${result.bundleId}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
