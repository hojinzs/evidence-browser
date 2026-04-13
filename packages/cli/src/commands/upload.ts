import { Command } from "commander";
import fs from "fs";
import path from "path";
import { uploadBundle } from "../lib/api-client";
import { addServerOptions, resolveServerOptions, type ServerOptionsInput } from "../lib/command-options";

interface UploadCommandOptions extends ServerOptionsInput {
  workspace: string;
  bundleId?: string;
}

export function registerUpload(program: Command): void {
  addServerOptions(
    program
      .command("upload <file>")
      .description("Upload a bundle ZIP to an Evidence Browser instance")
      .requiredOption("--workspace <slug>", "Workspace slug")
      .option("--bundle-id <id>", "Override bundle ID (default: derived from filename)")
  ).action(async (file: string, opts: UploadCommandOptions) => {
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
        const server = resolveServerOptions(opts);
        const result = await uploadBundle({
          filePath: absPath,
          url: server.url,
          workspace: opts.workspace,
          apiKey: server.apiKey,
          bundleId: opts.bundleId,
        });
        console.log(`Uploaded: ${result.bundleId}`);
        console.log(`  View: ${server.url.replace(/\/$/, "")}/w/${opts.workspace}/${result.bundleId}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
