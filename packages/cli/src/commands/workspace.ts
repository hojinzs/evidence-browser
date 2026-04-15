import { Command } from "commander";
import readline from "node:readline/promises";
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
} from "../lib/api-client";
import { addServerOptions, resolveServerOptions, type ServerOptionsInput } from "../lib/command-options";

type WorkspaceCommandOptions = ServerOptionsInput;

interface WorkspaceCreateCommandOptions extends WorkspaceCommandOptions {
  description?: string;
}

interface WorkspaceDeleteCommandOptions extends WorkspaceCommandOptions {
  force?: boolean;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function handleCommandError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

async function confirmWorkspaceDelete(slug: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Refusing to delete workspace "${slug}" without confirmation. Re-run with --force.`
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `Delete workspace "${slug}" and all of its bundles? [y/N] `
    );
    if (answer.trim().toLowerCase() !== "y") {
      throw new Error("Workspace deletion cancelled.");
    }
  } finally {
    rl.close();
  }
}

export function registerWorkspace(program: Command): void {
  const workspace = program.command("workspace").description("Manage workspaces");

  addServerOptions(
    workspace
      .command("list")
      .description("List workspaces")
  ).action(async (opts: WorkspaceCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await listWorkspaces(server);
      printJson(result.workspaces);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    workspace
      .command("create <slug> <name>")
      .description("Create a workspace")
      .option("--description <text>", "Workspace description")
  ).action(async (slug: string, name: string, opts: WorkspaceCreateCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await createWorkspace({ ...server, slug, name, description: opts.description });
      printJson(result.workspace);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    workspace
      .command("delete <slug>")
      .description("Delete a workspace")
      .option("--force", "Skip the confirmation prompt")
  ).action(async (slug: string, opts: WorkspaceDeleteCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      if (!opts.force) {
        await confirmWorkspaceDelete(slug);
      }
      await deleteWorkspace({ ...server, slug });
      console.log(`Deleted workspace: ${slug}`);
    } catch (err) {
      handleCommandError(err);
    }
  });
}
