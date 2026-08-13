import fs from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type PackageJson = {
  exports?: Record<string, unknown>;
};

const packageDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(packageDir, "package.json");
const rootBarrelPath = path.join(__dirname, "index.ts");

function readPackageSubpaths(): string[] {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson;
  return Object.keys(packageJson.exports ?? {})
    .filter((subpath) => subpath !== ".")
    .map((subpath) => subpath.replace(/^\.\//, "./"))
    .sort();
}

function readRootBarrelReexports(): string[] {
  const sourceFile = ts.createSourceFile(
    rootBarrelPath,
    fs.readFileSync(rootBarrelPath, "utf-8"),
    ts.ScriptTarget.Latest,
    true
  );

  const reexports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      reexports.add(statement.moduleSpecifier.text);
    }
  }

  return [...reexports].sort();
}

describe("root barrel exports", () => {
  it("re-exports every package subpath export", () => {
    expect(readRootBarrelReexports()).toEqual(expect.arrayContaining(readPackageSubpaths()));
  });
});
