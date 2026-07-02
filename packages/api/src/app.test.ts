import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { resetEnv } from "@/config/env";
import { createApp, resolveStaticRoot } from "./app";

describe("SPA static serving", () => {
  const originalStaticRoot = process.env.STATIC_ROOT;
  const tempDirs: string[] = [];

  afterEach(() => {
    if (originalStaticRoot === undefined) {
      delete process.env.STATIC_ROOT;
    } else {
      process.env.STATIC_ROOT = originalStaticRoot;
    }
    resetEnv();

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefers an explicit STATIC_ROOT", () => {
    expect(resolveStaticRoot("/srv/app")).toBe("/srv/app");
    expect(resolveStaticRoot("relative/spa", "/repo")).toBe(join("/repo", "relative/spa"));
  });

  it("defaults to packages/web/dist from root or api workspace cwd", () => {
    expect(resolveStaticRoot(undefined, "/repo", (path) => path === "/repo/packages/web/dist")).toBe(
      "/repo/packages/web/dist"
    );
    expect(
      resolveStaticRoot(undefined, "/repo/packages/api", (path) => path === "/repo/packages/web/dist")
    ).toBe("/repo/packages/web/dist");
  });

  it("serves SPA fallback from STATIC_ROOT without copying to root web", async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), "evidence-browser-spa-"));
    tempDirs.push(staticRoot);
    writeFileSync(join(staticRoot, "index.html"), "<!doctype html><title>Evidence Browser</title>");

    process.env.STATIC_ROOT = staticRoot;
    resetEnv();

    const app = createApp();
    const frontendRoute = await app.request("/w/demo");
    const apiRoute = await app.request("/api/missing");

    expect(frontendRoute.status).toBe(200);
    await expect(frontendRoute.text()).resolves.toContain("Evidence Browser");
    expect(apiRoute.status).toBe(404);
    await expect(apiRoute.json()).resolves.toEqual({ error: "Not found" });
  });
});
