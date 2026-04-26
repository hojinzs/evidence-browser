import { Command } from "commander";
import { registerApiKey } from "./commands/api-key";
import { registerAuth } from "./commands/auth";
import { registerBundle } from "./commands/bundle";
import { registerUpload } from "./commands/upload";
import { registerWorkspace } from "./commands/workspace";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("../package.json") as { version: string };

export function createCli(): Command {
  const program = new Command()
    .name("eb")
    .description("Evidence Browser CLI")
    .version(version);

  registerAuth(program);
  registerUpload(program);
  registerBundle(program);
  registerWorkspace(program);
  registerApiKey(program);

  return program;
}
