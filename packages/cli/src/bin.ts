#!/usr/bin/env node
import { createCli } from "./index";
import { handleCommandError } from "./lib/output";

createCli()
  .parseAsync(process.argv)
  .catch(handleCommandError);
