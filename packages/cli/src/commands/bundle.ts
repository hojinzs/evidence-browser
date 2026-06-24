import { Command } from "commander";
import type { Archiver, ZipArchive } from "archiver";
import fs from "fs";
import path from "path";
import type { Readable, Writable } from "stream";
import {
  deleteBundle,
  downloadBundleFile,
  getBundleMeta,
  getBundleTree,
  listBundles,
  type TreeNode,
} from "../lib/api-client";
import { addServerOptions, resolveServerOptions, type ServerOptionsInput } from "../lib/command-options";

interface BundleCommandOptions extends ServerOptionsInput {
  file?: string;
  force?: boolean;
  index?: string;
  output?: string;
  title?: string;
}

interface BundleCreateOptions {
  index?: string;
  output?: string;
  title?: string;
}

interface SharedBundleValidator {
  validateBundleZip(zipPath: string): Promise<{ title: string }>;
}

const { ZipArchive: ZipArchiveCtor } = require("archiver") as {
  ZipArchive: new (options?: { zlib?: { level: number } }) => ZipArchive;
};

function createZipArchive(): Archiver {
  return new ZipArchiveCtor({ zlib: { level: 9 } });
}

async function validateBundleZipFile(zipPath: string): Promise<{ title: string }> {
  const bundledSharedPath = path.join(__dirname, "..", "vendor", "shared", "index.js");
  const candidates = [bundledSharedPath, "@evidence-browser/shared"];

  for (const candidate of candidates) {
    try {
      const shared = require(candidate) as Partial<SharedBundleValidator>;
      if (typeof shared.validateBundleZip === "function") {
        return shared.validateBundleZip(zipPath);
      }
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
      if (code !== "MODULE_NOT_FOUND") {
        throw err;
      }
    }
  }

  throw new Error("Bundle validation module is not available");
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function formatTree(nodes: TreeNode[], prefix = ""): string[] {
  return nodes.flatMap((node, index) => {
    const isLast = index === nodes.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
    const lines = [`${prefix}${branch}${node.name}`];

    if (node.type === "directory" && node.children?.length) {
      lines.push(...formatTree(node.children, childPrefix));
    }

    return lines;
  });
}

function handleCommandError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

function formatValidationError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  if (err.name === "ManifestNotFoundError") {
    return "manifest.json was not found";
  }
  if (err.name === "ManifestValidationError") {
    if (err.message.includes("JSON")) {
      return "manifest.json is not valid JSON";
    }
    const missing = err.message.split(":").slice(1).join(":").trim();
    return missing ? `manifest.json validation failed: ${missing}` : "manifest.json validation failed";
  }
  if (err.name === "IndexFileNotFoundError") {
    const match = err.message.match(/^(.+?)(?:를 찾을 수 없습니다| was not found)$/);
    const indexPath = match?.[1] ?? err.message;
    return `Index file was not found: ${indexPath}`;
  }

  return err.message;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeBundlePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function findDefaultIndex(relativeFiles: string[]): string | null {
  if (relativeFiles.includes("index.md")) {
    return "index.md";
  }

  const markdown = relativeFiles
    .filter((file) => file.toLowerCase().endsWith(".md") || file.toLowerCase().endsWith(".markdown"))
    .sort();
  return markdown[0] ?? null;
}

async function createBundleZip(dir: string, options: BundleCreateOptions): Promise<string> {
  const sourceDir = path.resolve(dir);
  const stat = await fs.promises.stat(sourceDir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Directory not found: ${sourceDir}`);
  }

  const defaultOutput = path.resolve(`${path.basename(sourceDir)}.zip`);
  const outputPath = path.resolve(options.output ?? defaultOutput);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const files = await collectFiles(sourceDir);
  const outputRealPath = await fs.promises.realpath(outputPath).catch(() => outputPath);
  const sourceFiles = files.filter((file) => {
    const resolved = path.resolve(file);
    return resolved !== outputPath && resolved !== outputRealPath;
  });
  const relativeFiles = sourceFiles.map((file) => normalizeBundlePath(path.relative(sourceDir, file)));
  const hasManifest = relativeFiles.includes("manifest.json");

  let generatedManifest: { version: number; title: string; index: string } | null = null;
  if (!hasManifest) {
    const index = options.index ?? findDefaultIndex(relativeFiles);
    if (!index) {
      throw new Error("No index file found. Add index.md, another Markdown file, or pass --index <path>.");
    }
    if (!relativeFiles.includes(normalizeBundlePath(index))) {
      throw new Error(`Index file was not found: ${index}`);
    }

    generatedManifest = {
      version: 1,
      title: options.title ?? path.basename(sourceDir),
      index: normalizeBundlePath(index),
    };
  }

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = createZipArchive();

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);

    for (const file of sourceFiles) {
      archive.file(file, { name: normalizeBundlePath(path.relative(sourceDir, file)) });
    }

    if (generatedManifest) {
      archive.append(`${JSON.stringify(generatedManifest, null, 2)}\n`, { name: "manifest.json" });
    }

    void archive.finalize();
  });

  await validateBundleZipFile(outputPath);
  return outputPath;
}

export async function confirmBundleDeletion(
  workspace: string,
  bundleId: string,
  input: Readable = process.stdin,
  output: Writable = process.stdout
): Promise<boolean> {
  output.write(`Delete bundle "${bundleId}" from workspace "${workspace}"? [y/N] `);
  input.setEncoding("utf8");
  input.resume();

  return new Promise((resolve) => {
    const cleanup = () => {
      input.off("data", onData);
      input.off("end", onEnd);
    };

    const onData = (chunk: string | Buffer) => {
      cleanup();
      const answer = String(chunk).trim().toLowerCase();
      resolve(answer === "y" || answer === "yes");
    };

    const onEnd = () => {
      cleanup();
      resolve(false);
    };

    input.once("data", onData);
    input.once("end", onEnd);
  });
}

export function registerBundle(program: Command): void {
  const bundle = program.command("bundle").description("Inspect and download bundles");

  bundle
    .command("validate <file>")
    .description("Validate a local bundle ZIP without contacting a server")
    .action(async (file: string) => {
      const absPath = path.resolve(file);
      try {
        if (!await pathExists(absPath)) {
          throw new Error(`File not found: ${absPath}`);
        }
        if (!absPath.endsWith(".zip")) {
          throw new Error("File must be a .zip");
        }

        const result = await validateBundleZipFile(absPath);
        console.log(`Bundle is valid: ${result.title}`);
      } catch (err) {
        console.error(`Bundle validation failed: ${formatValidationError(err)}`);
        process.exit(1);
      }
    });

  bundle
    .command("create <dir>")
    .description("Package a directory into a bundle ZIP")
    .option("-o, --output <file>", "Output ZIP path")
    .option("--title <title>", "Title for generated manifest.json")
    .option("--index <path>", "Index file for generated manifest.json")
    .action(async (dir: string, opts: BundleCreateOptions) => {
      try {
        const outputPath = await createBundleZip(dir, opts);
        console.log(`Created bundle: ${outputPath}`);
      } catch (err) {
        console.error(`Bundle creation failed: ${formatValidationError(err)}`);
        process.exit(1);
      }
    });

  addServerOptions(
    bundle
      .command("list <workspace>")
      .description("List bundles in a workspace")
  ).action(async (workspace: string, opts: BundleCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await listBundles({ ...server, workspace });
      printJson(result.bundles);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    bundle
      .command("info <workspace> <bundleId>")
      .description("Show bundle manifest and metadata")
  ).action(async (workspace: string, bundleId: string, opts: BundleCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await getBundleMeta({ ...server, workspace, bundleId });
      printJson(result);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    bundle
      .command("tree <workspace> <bundleId>")
      .description("Show the file tree for a bundle")
  ).action(async (workspace: string, bundleId: string, opts: BundleCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await getBundleTree({ ...server, workspace, bundleId });
      const lines = formatTree(result.tree);
      if (lines.length === 0) {
        console.log("(empty)");
        return;
      }
      console.log(lines.join("\n"));
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    bundle
      .command("download <workspace> <bundleId>")
      .description("Download a file from a bundle to stdout")
      .requiredOption("--file <path>", "Path within the bundle")
  ).action(async (workspace: string, bundleId: string, opts: BundleCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await downloadBundleFile({
        ...server,
        workspace,
        bundleId,
        filePath: opts.file!,
      });
      process.stdout.write(result.content);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    bundle
      .command("delete <workspace> <bundleId>")
      .description("Delete a bundle from a workspace")
      .option("--force", "Skip confirmation prompt")
  ).action(async (workspace: string, bundleId: string, opts: BundleCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);

      if (!opts.force) {
        const confirmed = await confirmBundleDeletion(workspace, bundleId);
        if (!confirmed) {
          console.log("Deletion cancelled.");
          return;
        }
      }

      await deleteBundle({ ...server, workspace, bundleId });
      console.log(`Deleted bundle: ${bundleId}`);
    } catch (err) {
      handleCommandError(err);
    }
  });
}

export { formatTree };
