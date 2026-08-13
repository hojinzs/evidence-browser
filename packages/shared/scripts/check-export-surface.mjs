/* global console */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const packageJson = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));
const requireFromPackage = createRequire(resolve(packageDir, "package.json"));

const rootModule = requireFromPackage(packageJson.name);
const rootDts = readFileSync(resolve(packageDir, "dist/index.d.ts"), "utf8");
const failures = [];

function getExportTarget(entry, field) {
  if (typeof entry === "string") {
    return entry;
  }

  if (entry && typeof entry === "object" && typeof entry[field] === "string") {
    return entry[field];
  }

  return undefined;
}

function toPackageSpecifier(subpath) {
  return `${packageJson.name}/${subpath.replace(/^\.\//, "")}`;
}

function toDtsModuleSpecifier(typesTarget) {
  return typesTarget.replace(/^\.\/dist\//, "./").replace(/\.d\.ts$/, "");
}

for (const [subpath, entry] of Object.entries(packageJson.exports ?? {})) {
  if (subpath === ".") {
    continue;
  }

  const specifier = toPackageSpecifier(subpath);
  const typesTarget = getExportTarget(entry, "types");
  const dtsSpecifier = typesTarget ? toDtsModuleSpecifier(typesTarget) : undefined;

  if (dtsSpecifier && !rootDts.includes(`from "${dtsSpecifier}"`)) {
    failures.push(`${specifier}: missing emitted root declaration re-export from "${dtsSpecifier}"`);
  }

  const subpathModule = requireFromPackage(specifier);
  for (const exportName of Object.keys(subpathModule)) {
    if (!Object.prototype.hasOwnProperty.call(rootModule, exportName)) {
      failures.push(`${specifier}: runtime export "${exportName}" is missing from package root`);
    }
  }
}

if (failures.length > 0) {
  console.error("Shared package export surface is out of sync:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  exit(1);
}
