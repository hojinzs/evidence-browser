import { Command } from "commander";
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
