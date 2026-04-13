import { Command } from "commander";
import { registerUpload } from "./commands/upload";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("../package.json") as { version: string };

export function createCli(): Command {
  const program = new Command()
    .name("eb")
    .description("Evidence Browser CLI")
    .version(version);

  registerUpload(program);

  return program;
}
