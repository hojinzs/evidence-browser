import { Command, InvalidArgumentError } from "commander";
import {
  createApiKey,
  deleteApiKey,
  listAdminApiKeys,
  listApiKeys,
  type ApiKeyScope,
} from "../lib/api-client";
import { addServerOptions, resolveServerOptions, type ServerOptionsInput } from "../lib/command-options";

const API_KEY_SCOPES: ApiKeyScope[] = ["read", "upload", "admin"];

interface ApiKeyCommandOptions extends ServerOptionsInput {
  admin?: boolean;
}

interface ApiKeyCreateCommandOptions extends ServerOptionsInput {
  scope: ApiKeyScope;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function handleCommandError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

function parseApiKeyScope(value: string): ApiKeyScope {
  if (API_KEY_SCOPES.includes(value as ApiKeyScope)) {
    return value as ApiKeyScope;
  }

  throw new InvalidArgumentError("Scope must be one of: read, upload, admin");
}

export function registerApiKey(program: Command): void {
  const apiKey = program.command("api-key").description("Manage API keys");

  addServerOptions(
    apiKey
      .command("list")
      .description("List API keys")
      .option("--admin", "List all API keys (admin only)")
  ).action(async (opts: ApiKeyCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = opts.admin
        ? await listAdminApiKeys(server)
        : await listApiKeys(server);
      printJson(result.keys);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    apiKey
      .command("create <name>")
      .description("Create an API key")
      .requiredOption(
        "--scope <scope>",
        "API key scope (read, upload, admin)",
        parseApiKeyScope
      )
  ).action(async (name: string, opts: ApiKeyCreateCommandOptions) => {
    try {
      const server = resolveServerOptions(opts);
      const result = await createApiKey({ ...server, name, scope: opts.scope });
      printJson(result);
    } catch (err) {
      handleCommandError(err);
    }
  });

  addServerOptions(
    apiKey
      .command("delete <keyId>")
      .description("Delete an API key")
  ).action(async (keyId: string, opts: ServerOptionsInput) => {
    try {
      const server = resolveServerOptions(opts);
      await deleteApiKey({ ...server, keyId });
      console.log(`Deleted API key: ${keyId}`);
    } catch (err) {
      handleCommandError(err);
    }
  });
}
