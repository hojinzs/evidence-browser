import { Command } from "commander";
import fs from "fs";
import path from "path";
import { uploadBundle } from "../lib/api-client";
import { addServerOptions, resolveServerOptions, type ServerOptionsInput } from "../lib/command-options";
import { handleCommandError } from "../lib/output";

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
    try {
      const absPath = path.resolve(file);

      if (!fs.existsSync(absPath)) {
        throw new Error(`Error: File not found: ${absPath}`);
      }
      if (!absPath.endsWith(".zip")) {
        throw new Error("Error: File must be a .zip");
      }

      const server = resolveServerOptions(opts);
      const result = await uploadBundle({
        filePath: absPath,
        url: server.url,
        workspace: opts.workspace,
        apiKey: server.apiKey,
        bundleId: opts.bundleId,
      });
      console.log(`Uploaded: ${result.bundleId}`);
      console.log(`  View: ${server.url.replace(/\/$/, "")}/w/${opts.workspace}/b/${result.bundleId}`);
    } catch (err) {
      handleCommandError(err);
    }
    });
}
