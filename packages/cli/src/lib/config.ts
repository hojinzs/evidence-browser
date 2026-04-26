import fs from "fs";
import os from "os";
import path from "path";

export interface Config {
  url: string;
  apiKey: string;
}

export function getConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const base = xdgConfigHome || path.join(os.homedir(), ".config");
  return path.join(base, "evidence-browser", "config.json");
}

export function readConfig(): Partial<Config> {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const result: Partial<Config> = {};
      if (typeof obj["url"] === "string") result.url = obj["url"];
      if (typeof obj["apiKey"] === "string") result.apiKey = obj["apiKey"];
      return result;
    }
    return {};
  } catch {
    return {};
  }
}

export function writeConfig(config: Config): void {
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function clearConfig(): void {
  try {
    fs.unlinkSync(getConfigPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
