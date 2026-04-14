import { Command } from "commander";
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
} from "../lib/api-client";
import { addServerOptions, resolveServerOptions, type ServerOptionsInput } from "../lib/command-options";

interface WorkspaceCommandOptions extends ServerOptionsInput {}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function handleCommandError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
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
  ).action(async (slug: string, name: string, opts: WorkspaceCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await createWorkspace({ ...server, slug, name });
      printJson(result.workspace);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    workspace
      .command("delete <slug>")
      .description("Delete a workspace")
  ).action(async (slug: string, opts: WorkspaceCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      await deleteWorkspace({ ...server, slug });
      console.log(`Deleted workspace: ${slug}`);
    } catch (err) {
      handleCommandError(err);
    }
  });
}
