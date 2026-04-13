#!/usr/bin/env node
import { createCli } from "./index";

createCli()
  .parseAsync(process.argv)
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
