import type { Command } from "commander";
import { readConfig } from "./config";

export interface ServerOptionsInput {
  url?: string;
  apiKey?: string;
}

export interface ServerOptions {
  url: string;
  apiKey: string;
}

const URL_OPTION_DESCRIPTION =
  "Base URL of the Evidence Browser instance (or set EB_URL)";
const API_KEY_OPTION_DESCRIPTION =
  "API key with read/upload/admin scope (or set EB_API_KEY)";

export function addServerOptions<T extends Command>(command: T): T {
  return command
    .option("--url <url>", URL_OPTION_DESCRIPTION)
    .option("--api-key <key>", API_KEY_OPTION_DESCRIPTION);
}

export function resolveServerOptions(opts: ServerOptionsInput): ServerOptions {
  const config = readConfig();
  const url = opts.url ?? process.env.EB_URL ?? config.url;
  const apiKey = opts.apiKey ?? process.env.EB_API_KEY ?? config.apiKey;

  if (!url) {
    throw new Error(
      "Missing Evidence Browser URL. Pass --url, set EB_URL, or run: eb login <url>"
    );
  }
  if (!apiKey) {
    throw new Error(
      "Missing API key. Pass --api-key, set EB_API_KEY, or run: eb login <url>"
    );
  }

  return { url, apiKey };
}
