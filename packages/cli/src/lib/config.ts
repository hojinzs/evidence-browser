import fs from "fs";
import os from "os";
import path from "path";

export interface Config {
  url: string;
  apiKey: string;
}

export function getConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(base, "evidence-browser", "config.json");
}

export function readConfig(): Partial<Config> {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<Config>;
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
