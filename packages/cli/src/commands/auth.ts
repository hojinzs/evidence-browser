import { Command } from "commander";
import os from "os";
import readline from "readline";
import { type ApiKeySummary, listApiKeys } from "../lib/api-client";
import { clearConfig, getConfigPath, readConfig, writeConfig, type Config } from "../lib/config";

function handleCommandError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

export function maskApiKey(key: string): string {
  if (key.length <= 11) return key;
  return key.slice(0, 11) + "...";
}

export function promptText(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function promptSecret(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin as NodeJS.ReadStream;
    const isTTY = stdin.isTTY === true && typeof stdin.setRawMode === "function";

    if (!isTTY) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdout.write(question);
    stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let value = "";

    const cleanup = () => {
      stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };

    const onData = (char: string) => {
      switch (char) {
        case "\r":
        case "\n":
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          break;

        case "":
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Cancelled by user"));
          break;

        case "":
        case "\b":
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          break;

        default:
          if (char >= " ") {
            value += char;
            process.stdout.write("*");
          }
          break;
      }
    };

    process.stdin.on("data", onData);
  });
}

export async function validateApiKey(
  url: string,
  apiKey: string
): Promise<ApiKeySummary[]> {
  try {
    const result = await listApiKeys({ url, apiKey });
    return result.keys;
  } catch (err) {
    if (err instanceof Error) {
      if (/Request failed \(401\)/.test(err.message)) {
        throw new Error("Invalid API key");
      }
      throw new Error(`Cannot reach server: ${err.message}`);
    }
    throw err;
  }
}

function displayConfigPath(configPath: string): string {
  const home = os.homedir();
  return configPath.startsWith(home)
    ? "~" + configPath.slice(home.length)
    : configPath;
}

export function registerAuth(program: Command): void {
  program
    .command("login [url]")
    .description("Save server URL and API key to the local config file")
    .action(async (urlArg: string | undefined) => {
      try {
        let url = urlArg?.trim();
        if (!url) {
          url = await promptText("Server URL: ");
        }
        if (!url) {
          throw new Error("Server URL is required.");
        }
        url = url.replace(/\/+$/, "");

        const apiKey = await promptSecret("API key: ");
        if (!apiKey) {
          throw new Error("API key is required.");
        }

        await validateApiKey(url, apiKey);

        const config: Config = { url, apiKey };
        writeConfig(config);

        const displayPath = displayConfigPath(getConfigPath());
        console.log("✓ Logged in");
        console.log(`  Server:  ${url}`);
        console.log(`  Key:     ${maskApiKey(apiKey)}`);
        console.log(`  Saved:   ${displayPath}`);
      } catch (err) {
        handleCommandError(err);
      }
    });

  program
    .command("logout")
    .description("Remove the saved config file")
    .action(() => {
      try {
        clearConfig();
        console.log("Logged out. Configuration removed.");
      } catch (err) {
        handleCommandError(err);
      }
    });

  program
    .command("whoami")
    .description("Show current authentication status")
    .action(async () => {
      try {
        const config = readConfig();

        if (!config.url || !config.apiKey) {
          console.log("Not logged in. Run: eb login <url>");
          return;
        }

        const displayPath = displayConfigPath(getConfigPath());
        console.log(`  Server:  ${config.url}`);
        console.log(`  Key:     ${maskApiKey(config.apiKey)}`);
        console.log(`  Config:  ${displayPath}`);

        let keys: ApiKeySummary[] | null = null;
        let authStatus: "ok" | "invalid" | "unreachable" = "ok";

        try {
          keys = await validateApiKey(config.url, config.apiKey);
        } catch (err) {
          if (err instanceof Error) {
            authStatus = err.message === "Invalid API key" ? "invalid" : "unreachable";
          }
        }

        if (authStatus === "ok" && keys !== null) {
          const n = keys.length;
          console.log(`  Status:  ✓ authenticated (${n} key${n !== 1 ? "s" : ""} on account)`);
        } else if (authStatus === "invalid") {
          console.log("  Status:  ✗ Key invalid or expired");
          process.exit(1);
        } else {
          console.log("  Status:  ✗ Cannot reach server");
          process.exit(1);
        }
      } catch (err) {
        handleCommandError(err);
      }
    });
}
