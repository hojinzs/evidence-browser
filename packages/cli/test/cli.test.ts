import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test, vi } from "vitest";

vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  const shared = await import("@evidence-browser/shared");

  return {
    ...actual,
    createRequire: (filename: string | URL) => {
      const nodeRequire = actual.createRequire(filename);
      const wrappedRequire = ((id: string) => {
        if (id === "@evidence-browser/shared") {
          return shared;
        }
        return nodeRequire(id);
      }) as NodeJS.Require;

      return Object.assign(wrappedRequire, nodeRequire);
    },
  };
});

vi.mock("module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  const shared = await import("@evidence-browser/shared");

  return {
    ...actual,
    createRequire: (filename: string | URL) => {
      const nodeRequire = actual.createRequire(filename);
      const wrappedRequire = ((id: string) => {
        if (id === "@evidence-browser/shared") {
          return shared;
        }
        return nodeRequire(id);
      }) as NodeJS.Require;

      return Object.assign(wrappedRequire, nodeRequire);
    },
  };
});

import { createCli } from "../src";
import { maskApiKey, validateApiKey } from "../src/commands/auth";
import { confirmBundleDeletion } from "../src/commands/bundle";
import { createApiKey, createWorkspace, deleteApiKey, deleteBundle, deleteWorkspace, downloadBundleFile, listAdminApiKeys, listApiKeys, listBundles, listWorkspaces, updateWorkspace, uploadBundle } from "../src/lib/api-client";
import { resolveServerOptions } from "../src/lib/command-options";
import { clearConfig, getConfigPath, readConfig, writeConfig } from "../src/lib/config";

async function readZipText(zipPath: string, entryName: string): Promise<string> {
  const { open } = await import("yauzl-promise");
  const zipFile = await open(zipPath);

  try {
    for await (const entry of zipFile) {
      if (entry.filename !== entryName) continue;

      const readStream = await entry.openReadStream();
      const chunks = [];
      for await (const chunk of readStream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString("utf8");
    }
  } finally {
    await zipFile.close();
  }

  throw new Error(`Entry not found: ${entryName}`);
}

async function writeZipEntries(
  zipPath: string,
  entries: Record<string, string | Buffer>
): Promise<void> {
  const { ZipArchive } = await import("archiver");

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);

    for (const [name, content] of Object.entries(entries)) {
      archive.append(content, { name });
    }

    archive.finalize();
  });
}

function restoreEnv(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = previousValue;
}

function requestInit(init: RequestInit | undefined): RequestInit {
  assert.ok(init);
  return init;
}

function requestHeaders(init: RequestInit | undefined): Headers {
  const { headers } = requestInit(init);
  assert.ok(headers instanceof Headers);
  return headers;
}

function requestHeader(init: RequestInit | undefined, name: string): string | null {
  const { headers } = requestInit(init);
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  return new Headers(headers).get(name);
}

function requestBodyText(init: RequestInit | undefined): string {
  const { body } = requestInit(init);
  if (typeof body !== "string") {
    assert.fail("Expected request body to be a string");
  }
  return body;
}

test("resolveServerOptions falls back to environment variables", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_test";

  try {
    assert.deepEqual(resolveServerOptions({}), {
      url: "https://eb.example.com",
      apiKey: "eb_test",
    });
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
  }
});

test("listBundles sends bearer auth to the bundle list endpoint", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundle");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_read");
    return new Response(JSON.stringify({ bundles: [{ bundle_id: "bundle-1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await listBundles({
      url: "https://eb.example.com/",
      apiKey: "eb_read",
      workspace: "demo",
    });
    assert.deepEqual(result, { bundles: [{ bundle_id: "bundle-1" }] });
  } finally {
    global.fetch = previousFetch;
  }
});

test("listBundles preserves plain text error bodies", async () => {
  const previousFetch = global.fetch;

  global.fetch = async () =>
    new Response("workspace missing", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });

  try {
    await assert.rejects(
      listBundles({
        url: "https://eb.example.com",
        apiKey: "eb_read",
        workspace: "demo",
      }),
      /Request failed \(404\): workspace missing/
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test("uploadBundle accepts DB-shaped snake_case bundle responses", async () => {
  const previousFetch = global.fetch;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-cli-test-"));
  const zipPath = path.join(tmpDir, "bundle-1.zip");
  fs.writeFileSync(zipPath, "zip bytes");

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundle");
    assert.equal(requestInit(init).method, "POST");
    assert.equal(requestHeader(init, "Authorization"), "Bearer eb_upload");
    assert.ok(requestInit(init).body instanceof FormData);
    return new Response(
      JSON.stringify({ bundle: { bundle_id: "bundle-1" } }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await uploadBundle({
      url: "https://eb.example.com",
      apiKey: "eb_upload",
      workspace: "demo",
      filePath: zipPath,
    });
    assert.deepEqual(result, { bundleId: "bundle-1" });
  } finally {
    global.fetch = previousFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("upload command prints the canonical bundle landing URL", async () => {
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-cli-test-"));
  const zipPath = path.join(tmpDir, "bundle-1.zip");
  const lines: string[] = [];
  fs.writeFileSync(zipPath, "zip bytes");

  console.log = (value) => lines.push(value);
  global.fetch = async () =>
    new Response(
      JSON.stringify({ bundle: { bundle_id: "bundle-1" } }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "upload",
      zipPath,
      "--workspace",
      "demo",
      "--url",
      "https://eb.example.com/",
      "--api-key",
      "eb_upload",
    ]);
    assert.deepEqual(lines, [
      "Uploaded: bundle-1",
      "  View: https://eb.example.com/w/demo/b/bundle-1",
    ]);
  } finally {
    global.fetch = previousFetch;
    console.log = previousLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listWorkspaces sends bearer auth to the workspace list endpoint", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_read");
    return new Response(JSON.stringify({ workspaces: [{ slug: "demo" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await listWorkspaces({
      url: "https://eb.example.com/",
      apiKey: "eb_read",
    });
    assert.deepEqual(result, { workspaces: [{ slug: "demo" }] });
  } finally {
    global.fetch = previousFetch;
  }
});

test("createWorkspace sends JSON to the workspace endpoint", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w");
    assert.equal(requestInit(init).method, "POST");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_admin");
    assert.equal(requestHeaders(init).get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(requestBodyText(init)), {
      slug: "demo",
      name: "Demo Workspace",
    });

    return new Response(JSON.stringify({ workspace: { id: "ws_1", slug: "demo" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await createWorkspace({
      url: "https://eb.example.com",
      apiKey: "eb_admin",
      slug: "demo",
      name: "Demo Workspace",
    });
    assert.deepEqual(result, { workspace: { id: "ws_1", slug: "demo" } });
  } finally {
    global.fetch = previousFetch;
  }
});

test("createWorkspace includes description when provided", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(requestBodyText(init)), {
      slug: "demo",
      name: "Demo Workspace",
      description: "Team docs",
    });

    return new Response(JSON.stringify({ workspace: { id: "ws_1", slug: "demo" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await createWorkspace({
      url: "https://eb.example.com",
      apiKey: "eb_admin",
      slug: "demo",
      name: "Demo Workspace",
      description: "Team docs",
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test("deleteWorkspace sends a direct delete request for the workspace slug", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init: RequestInit = {}) => {
    assert.equal(url, "https://eb.example.com/api/w/demo");
    assert.equal(requestInit(init).method, "DELETE");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_admin");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await deleteWorkspace({
      url: "https://eb.example.com",
      apiKey: "eb_admin",
      slug: "demo",
    });

    assert.deepEqual(result, { success: true });
  } finally {
    global.fetch = previousFetch;
  }
});

test("updateWorkspace sends JSON to the workspace patch endpoint", async () => {
  const previousFetch = global.fetch;
  const requests: unknown[] = [];

  global.fetch = async (url, init) => {
    requests.push(url);

    if (url === "https://eb.example.com/api/w/demo") {
      assert.ok(requestHeaders(init) instanceof Headers);
      assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_admin");
      return new Response(
        JSON.stringify({
          workspace: {
            id: "ws_1",
            slug: "demo",
            name: "Demo Workspace",
            description: "Old description",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    assert.equal(url, "https://eb.example.com/api/w/ws_1");
    assert.equal(requestInit(init).method, "PATCH");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_admin");
    assert.equal(requestHeaders(init).get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(requestBodyText(init)), {
      name: "Updated Workspace",
      description: "Updated description",
    });

    return new Response(
      JSON.stringify({
        workspace: {
          id: "ws_1",
          slug: "demo",
          name: "Updated Workspace",
          description: "Updated description",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await updateWorkspace({
      url: "https://eb.example.com",
      apiKey: "eb_admin",
      slug: "demo",
      name: "Updated Workspace",
      description: "Updated description",
    });

    assert.deepEqual(result, {
      workspace: {
        id: "ws_1",
        slug: "demo",
        name: "Updated Workspace",
        description: "Updated description",
      },
    });
    assert.deepEqual(requests, [
      "https://eb.example.com/api/w/demo",
      "https://eb.example.com/api/w/ws_1",
    ]);
  } finally {
    global.fetch = previousFetch;
  }
});

test("listApiKeys sends bearer auth to the user API key endpoint", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/api-keys");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_read");
    return new Response(JSON.stringify({ keys: [{ id: "key_1", scope: "read" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await listApiKeys({
      url: "https://eb.example.com/",
      apiKey: "eb_read",
    });
    assert.deepEqual(result, { keys: [{ id: "key_1", scope: "read" }] });
  } finally {
    global.fetch = previousFetch;
  }
});

test("listAdminApiKeys sends bearer auth to the admin API key endpoint", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/admin/api-keys");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_admin");
    return new Response(JSON.stringify({ keys: [{ id: "key_1", username: "admin" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await listAdminApiKeys({
      url: "https://eb.example.com",
      apiKey: "eb_admin",
    });
    assert.deepEqual(result, { keys: [{ id: "key_1", username: "admin" }] });
  } finally {
    global.fetch = previousFetch;
  }
});

test("createApiKey sends JSON to the API key endpoint", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/api-keys");
    assert.equal(requestInit(init).method, "POST");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_upload");
    assert.equal(requestHeaders(init).get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(requestBodyText(init)), {
      name: "CI Upload",
      scope: "upload",
    });

    return new Response(JSON.stringify({
      key: "eb_secret",
      record: { id: "key_1", name: "CI Upload", scope: "upload" },
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await createApiKey({
      url: "https://eb.example.com",
      apiKey: "eb_upload",
      name: "CI Upload",
      scope: "upload",
    });
    assert.deepEqual(result, {
      key: "eb_secret",
      record: { id: "key_1", name: "CI Upload", scope: "upload" },
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test("deleteApiKey sends a delete request for the API key id", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init: RequestInit = {}) => {
    assert.equal(url, "https://eb.example.com/api/api-keys/key_1");
    assert.equal(requestInit(init).method, "DELETE");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_admin");
    return new Response(null, { status: 204 });
  };

  try {
    await deleteApiKey({
      url: "https://eb.example.com",
      apiKey: "eb_admin",
      keyId: "key_1",
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test("downloadBundleFile encodes the nested file path", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url) => {
    assert.equal(
      url,
      "https://eb.example.com/api/w/demo/bundles/bundle-1/file?path=reports%2Fsummary.md"
    );
    return new Response("hello", { status: 200 });
  };

  try {
    const result = await downloadBundleFile({
      url: "https://eb.example.com",
      apiKey: "eb_read",
      workspace: "demo",
      bundleId: "bundle-1",
      filePath: "reports/summary.md",
    });
    assert.equal(result.content.toString("utf8"), "hello");
  } finally {
    global.fetch = previousFetch;
  }
});

test("deleteBundle sends bearer auth to the bundle delete endpoint", async () => {
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundles/bundle-1");
    assert.equal(requestInit(init).method, "DELETE");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_write");
    return new Response(null, { status: 204 });
  };

  try {
    await deleteBundle({
      url: "https://eb.example.com/",
      apiKey: "eb_write",
      workspace: "demo",
      bundleId: "bundle-1",
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test("confirmBundleDeletion accepts yes input", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let prompt = "";

  output.on("data", (chunk) => {
    prompt += chunk.toString("utf8");
  });

  const confirmation = confirmBundleDeletion("demo", "bundle-1", input, output);
  input.end("yes\n");

  assert.equal(await confirmation, true);
  assert.equal(prompt, 'Delete bundle "bundle-1" from workspace "demo"? [y/N] ');
});

test("bundle tree command uses environment-backed server options and prints a tree", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousLog = console.log;

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_read";

  const lines: string[] = [];
  console.log = (value) => lines.push(value);
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        tree: [
          {
            name: "docs",
            type: "directory",
            path: "docs",
            children: [{ name: "intro.md", type: "file", path: "docs/intro.md" }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    await createCli().parseAsync(["node", "eb", "bundle", "tree", "demo", "bundle-1"]);
    assert.deepEqual(lines, ["└── docs\n    └── intro.md"]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

test("bundle delete command deletes immediately with --force", async () => {
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const lines: string[] = [];

  console.log = (value) => lines.push(value);
  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundles/bundle-1");
    assert.equal(requestInit(init).method, "DELETE");
    return new Response(null, { status: 204 });
  };

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "bundle",
      "delete",
      "demo",
      "bundle-1",
      "--url",
      "https://eb.example.com",
      "--api-key",
      "eb_write",
      "--force",
    ]);
    assert.deepEqual(lines, ["Deleted bundle: bundle-1"]);
  } finally {
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

test("bundle validate passes for a local zip without server calls", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-cli-bundle-"));
  const sourceDir = path.join(tmpDir, "report");
  const zipPath = path.join(tmpDir, "report.zip");
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const lines: string[] = [];

  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, "index.md"), "# Report\n");
  console.log = (value) => lines.push(value);
  global.fetch = async () => {
    throw new Error("validate should not call fetch");
  };

  try {
    await createCli().parseAsync(["node", "eb", "bundle", "create", sourceDir, "--output", zipPath]);
    lines.length = 0;
    await createCli().parseAsync(["node", "eb", "bundle", "validate", zipPath]);
    assert.deepEqual(lines, ["Bundle is valid: report"]);
  } finally {
    global.fetch = previousFetch;
    console.log = previousLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("bundle validate fails for an invalid local zip without server calls", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-cli-bundle-"));
  const zipPath = path.join(tmpDir, "broken.zip");
  const previousError = console.error;
  const previousExit = process.exit;
  const errors: string[] = [];
  let exitCode: string | number | null | undefined;

  console.error = (value?: unknown) => {
    errors.push(String(value));
  };
  process.exit = ((code?: string | number | null | undefined) => {
    exitCode = code;
    throw new Error(`process.exit:${code}`);
  }) as typeof process.exit;

  try {
    await writeZipEntries(zipPath, { "index.md": "# Broken\n" });

    await assert.rejects(
      createCli().parseAsync(["node", "eb", "bundle", "validate", zipPath]),
      /process\.exit:1/
    );
    assert.equal(exitCode, 1);
    assert.deepEqual(errors, ["Bundle validation failed: manifest.json was not found"]);
  } finally {
    console.error = previousError;
    process.exit = previousExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("bundle validate reports missing manifest fields in English", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-cli-bundle-"));
  const zipPath = path.join(tmpDir, "missing-title.zip");
  const previousError = console.error;
  const previousExit = process.exit;
  const errors: string[] = [];
  let exitCode: string | number | null | undefined;

  console.error = (value?: unknown) => {
    errors.push(String(value));
  };
  process.exit = ((code?: string | number | null | undefined) => {
    exitCode = code;
    throw new Error(`process.exit:${code}`);
  }) as typeof process.exit;

  try {
    await writeZipEntries(zipPath, {
      "manifest.json": `${JSON.stringify({ version: 1, index: "index.md" }, null, 2)}\n`,
      "index.md": "# Missing title\n",
    });

    await assert.rejects(
      createCli().parseAsync(["node", "eb", "bundle", "validate", zipPath]),
      /process\.exit:1/
    );
    assert.equal(exitCode, 1);
    assert.deepEqual(errors, [
      "Bundle validation failed: manifest.json validation failed: Missing required field(s): title",
    ]);
  } finally {
    console.error = previousError;
    process.exit = previousExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("bundle create generates a valid manifest when one is absent", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-cli-bundle-"));
  const sourceDir = path.join(tmpDir, "daily-report");
  const zipPath = path.join(tmpDir, "daily.zip");
  const previousLog = console.log;
  const lines: string[] = [];

  fs.mkdirSync(path.join(sourceDir, "notes"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "notes", "summary.md"), "# Summary\n");
  console.log = (value) => lines.push(value);

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "bundle",
      "create",
      sourceDir,
      "--output",
      zipPath,
      "--title",
      "Daily Report",
      "--index",
      "./notes/summary.md",
    ]);
    assert.deepEqual(lines, [`Created bundle: ${zipPath}`]);
    const manifest = JSON.parse(await readZipText(zipPath, "manifest.json"));
    assert.deepEqual(manifest, {
      version: 1,
      title: "Daily Report",
      index: "notes/summary.md",
    });
  } finally {
    console.log = previousLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("bundle create preserves an existing manifest and ignores manifest flags", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-cli-bundle-"));
  const sourceDir = path.join(tmpDir, "existing-manifest");
  const zipPath = path.join(tmpDir, "existing.zip");
  const previousLog = console.log;

  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, "README.md"), "# Readme\n");
  fs.writeFileSync(
    path.join(sourceDir, "manifest.json"),
    `${JSON.stringify({ version: 1, title: "Existing Title", index: "README.md" }, null, 2)}\n`
  );
  console.log = () => {};

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "bundle",
      "create",
      sourceDir,
      "--output",
      zipPath,
      "--title",
      "Ignored Title",
      "--index",
      "ignored.md",
    ]);
    const manifest = JSON.parse(await readZipText(zipPath, "manifest.json"));
    assert.deepEqual(manifest, {
      version: 1,
      title: "Existing Title",
      index: "README.md",
    });
  } finally {
    console.log = previousLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("workspace create command uses environment-backed server options and prints JSON", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousLog = console.log;

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";

  const lines: string[] = [];
  console.log = (value) => lines.push(value);
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        workspace: {
          id: "ws_1",
          slug: "demo",
          name: "Demo Workspace",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );

  try {
    await createCli().parseAsync(["node", "eb", "workspace", "create", "demo", "Demo Workspace"]);
    assert.deepEqual(lines, [
      JSON.stringify(
        {
          id: "ws_1",
          slug: "demo",
          name: "Demo Workspace",
        },
        null,
        2
      ),
    ]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

test("workspace create command forwards the optional description", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";

  global.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(requestBodyText(init)), {
      slug: "demo",
      name: "Demo Workspace",
      description: "Team docs",
    });

    return new Response(
      JSON.stringify({
        workspace: {
          id: "ws_1",
          slug: "demo",
          name: "Demo Workspace",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "workspace",
      "create",
      "demo",
      "Demo Workspace",
      "--description",
      "Team docs",
    ]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
  }
});

test("workspace update command uses environment-backed server options and prints JSON", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const requests: unknown[] = [];

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";

  const lines: string[] = [];
  console.log = (value) => lines.push(value);
  global.fetch = async (_url, init) => {
    requests.push({
      url: _url,
      method: init?.method ?? "GET",
      body: init?.body,
    });

    if (_url === "https://eb.example.com/api/w/demo") {
      return new Response(
        JSON.stringify({
          workspace: {
            id: "ws_1",
            slug: "demo",
            name: "Demo Workspace",
            description: "Old description",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        workspace: {
          id: "ws_1",
          slug: "demo",
          name: "Updated Workspace",
          description: "Updated description",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "workspace",
      "update",
      "demo",
      "--name",
      "Updated Workspace",
      "--description",
      "Updated description",
    ]);
    assert.deepEqual(lines, [
      JSON.stringify(
        {
          id: "ws_1",
          slug: "demo",
          name: "Updated Workspace",
          description: "Updated description",
        },
        null,
        2
      ),
    ]);
    assert.deepEqual(requests, [
      {
        url: "https://eb.example.com/api/w/demo",
        method: "GET",
        body: undefined,
      },
      {
        url: "https://eb.example.com/api/w/ws_1",
        method: "PATCH",
        body: JSON.stringify({
          name: "Updated Workspace",
          description: "Updated description",
        }),
      },
    ]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

test("workspace update command requires at least one mutable field", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousError = console.error;
  const previousExit = process.exit;
  const errors: string[] = [];
  let exitCode;

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";
  global.fetch = async () => {
    throw new Error("fetch should not run");
  };
  console.error = (value) => errors.push(value);
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`process.exit:${code}`);
  };

  try {
    await assert.rejects(
      createCli().parseAsync(["node", "eb", "workspace", "update", "demo"]),
      /process\.exit:1/
    );
    assert.equal(exitCode, 1);
    assert.deepEqual(errors, ["At least one of --name or --description is required."]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.error = previousError;
    process.exit = previousExit;
  }
});

test("workspace delete command requires --force without a TTY", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousError = console.error;
  const previousExit = process.exit;
  const stdinTty = process.stdin.isTTY;
  const stdoutTty = process.stdout.isTTY;
  const errors: string[] = [];
  let exitCode;

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";
  global.fetch = async () => {
    throw new Error("fetch should not run");
  };
  console.error = (value) => errors.push(value);
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`process.exit:${code}`);
  };
  process.stdin.isTTY = false;
  process.stdout.isTTY = false;

  try {
    await assert.rejects(
      createCli().parseAsync(["node", "eb", "workspace", "delete", "demo"]),
      /process\.exit:1/
    );
    assert.equal(exitCode, 1);
    assert.deepEqual(errors, [
      'Refusing to delete workspace "demo" without confirmation. Re-run with --force.',
    ]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.error = previousError;
    process.exit = previousExit;
    process.stdin.isTTY = stdinTty;
    process.stdout.isTTY = stdoutTty;
  }
});

test("workspace delete command supports --force", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const lines: string[] = [];

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";
  console.log = (value) => lines.push(value);
  global.fetch = async (url, init: RequestInit = {}) => {
    assert.equal(url, "https://eb.example.com/api/w/demo");
    assert.equal(requestInit(init).method, "DELETE");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await createCli().parseAsync(["node", "eb", "workspace", "delete", "demo", "--force"]);
    assert.deepEqual(lines, ["Deleted workspace: demo"]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

test("api-key list command supports --admin", async () => {
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const lines: string[] = [];

  console.log = (value) => lines.push(value);
  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/admin/api-keys");
    assert.ok(requestHeaders(init) instanceof Headers);
    assert.equal(requestHeaders(init).get("Authorization"), "Bearer eb_admin");

    return new Response(
      JSON.stringify({
        keys: [{ id: "key_1", username: "admin", scope: "admin" }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "api-key",
      "list",
      "--admin",
      "--url",
      "https://eb.example.com",
      "--api-key",
      "eb_admin",
    ]);
    assert.deepEqual(lines, [
      JSON.stringify([{ id: "key_1", username: "admin", scope: "admin" }], null, 2),
    ]);
  } finally {
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

test("api-key create command uses environment-backed server options and prints the created key", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousLog = console.log;

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";

  const lines: string[] = [];
  console.log = (value) => lines.push(value);
  global.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(requestBodyText(init)), {
      name: "CI Upload",
      scope: "upload",
    });

    return new Response(
      JSON.stringify({
        key: "eb_secret",
        record: {
          id: "key_1",
          name: "CI Upload",
          scope: "upload",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "api-key",
      "create",
      "CI Upload",
      "--scope",
      "upload",
    ]);
    assert.deepEqual(lines, [
      JSON.stringify(
        {
          key: "eb_secret",
          record: {
            id: "key_1",
            name: "CI Upload",
            scope: "upload",
          },
        },
        null,
        2
      ),
    ]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

test("api-key delete command prints a success message", async () => {
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const lines: string[] = [];

  console.log = (value) => lines.push(value);
  global.fetch = async (url, init: RequestInit = {}) => {
    assert.equal(url, "https://eb.example.com/api/api-keys/key_1");
    assert.equal(requestInit(init).method, "DELETE");
    return new Response(null, { status: 204 });
  };

  try {
    await createCli().parseAsync([
      "node",
      "eb",
      "api-key",
      "delete",
      "key_1",
      "--url",
      "https://eb.example.com",
      "--api-key",
      "eb_admin",
    ]);
    assert.deepEqual(lines, ["Deleted API key: key_1"]);
  } finally {
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});

// ── config.ts ─────────────────────────────────────────────────────────────────

test("readConfig returns empty object when config file does not exist", () => {
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = "/tmp/eb-test-none-" + Date.now();
  try {
    assert.deepEqual(readConfig(), {});
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
  }
});

test("getConfigPath treats empty XDG_CONFIG_HOME as unset", () => {
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = "";
  try {
    assert.equal(
      getConfigPath(),
      path.join(os.homedir(), ".config", "evidence-browser", "config.json")
    );
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
  }
});

test("writeConfig and readConfig round-trip, clearConfig removes the file", () => {
  const tmpDir = path.join(os.tmpdir(), "eb-test-rw-" + Date.now());
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;
  try {
    const config = { url: "https://example.com", apiKey: "eb_testkey1234567890" };
    writeConfig(config);
    assert.deepEqual(readConfig(), config);
    clearConfig();
    assert.deepEqual(readConfig(), {});
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("clearConfig is a no-op when file does not exist", () => {
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = "/tmp/eb-test-noop-" + Date.now();
  try {
    assert.doesNotThrow(() => clearConfig());
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
  }
});

// ── auth.ts ───────────────────────────────────────────────────────────────────

test("maskApiKey truncates keys longer than 11 characters", () => {
  assert.equal(maskApiKey("eb_abcde12345678901234567890123456"), "eb_abcde123...");
  assert.equal(maskApiKey("eb_short"), "eb_short");
});

test("validateApiKey throws 'Invalid API key' on 401", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  try {
    await assert.rejects(validateApiKey("https://example.com", "eb_bad"), /Invalid API key/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("validateApiKey throws 'Cannot reach server' on network error", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => { throw new Error("ECONNREFUSED"); };
  try {
    await assert.rejects(
      validateApiKey("https://example.com", "eb_test"),
      /Cannot reach server/
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test("validateApiKey returns keys on success", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ keys: [{ id: "key_1", scope: "upload" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  try {
    const keys = await validateApiKey("https://example.com", "eb_valid");
    assert.deepEqual(keys, [{ id: "key_1", scope: "upload" }]);
  } finally {
    global.fetch = previousFetch;
  }
});

// ── resolveServerOptions: config file fallback ────────────────────────────────

test("resolveServerOptions falls back to config file when env and flags are absent", () => {
  const tmpDir = path.join(os.tmpdir(), "eb-test-opts-" + Date.now());
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  process.env.XDG_CONFIG_HOME = tmpDir;
  delete process.env.EB_URL;
  delete process.env.EB_API_KEY;
  try {
    writeConfig({ url: "https://config.example.com", apiKey: "eb_from_config" });
    assert.deepEqual(resolveServerOptions({}), {
      url: "https://config.example.com",
      apiKey: "eb_from_config",
    });
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("resolveServerOptions prefers env vars over config file", () => {
  const tmpDir = path.join(os.tmpdir(), "eb-test-prio-" + Date.now());
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  process.env.XDG_CONFIG_HOME = tmpDir;
  process.env.EB_URL = "https://env.example.com";
  process.env.EB_API_KEY = "eb_from_env";
  try {
    writeConfig({ url: "https://config.example.com", apiKey: "eb_from_config" });
    assert.deepEqual(resolveServerOptions({}), {
      url: "https://env.example.com",
      apiKey: "eb_from_env",
    });
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── eb logout command ─────────────────────────────────────────────────────────

test("eb logout removes the config file and prints confirmation", async () => {
  const tmpDir = path.join(os.tmpdir(), "eb-test-logout-" + Date.now());
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousLog = console.log;
  const lines: string[] = [];
  process.env.XDG_CONFIG_HOME = tmpDir;
  console.log = (value) => lines.push(value);
  try {
    writeConfig({ url: "https://example.com", apiKey: "eb_test" });
    await createCli().parseAsync(["node", "eb", "logout"]);
    assert.deepEqual(lines, ["Logged out. Configuration removed."]);
    assert.deepEqual(readConfig(), {});
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    console.log = previousLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── eb whoami command ─────────────────────────────────────────────────────────

test("eb whoami prints 'Not logged in' when config is absent", async () => {
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousLog = console.log;
  const lines: string[] = [];
  process.env.XDG_CONFIG_HOME = "/tmp/eb-test-nowhoami-" + Date.now();
  console.log = (value) => lines.push(value);
  try {
    await createCli().parseAsync(["node", "eb", "whoami"]);
    assert.deepEqual(lines, ["Not logged in. Run: eb login <url>"]);
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    console.log = previousLog;
  }
});

test("eb whoami prints authenticated status on valid key", async () => {
  const tmpDir = path.join(os.tmpdir(), "eb-test-whoami-ok-" + Date.now());
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const lines: string[] = [];
  process.env.XDG_CONFIG_HOME = tmpDir;
  console.log = (value) => lines.push(value);
  global.fetch = async () =>
    new Response(JSON.stringify({ keys: [{ id: "key_1" }, { id: "key_2" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  try {
    writeConfig({ url: "https://example.com", apiKey: "eb_abcde12345678" });
    await createCli().parseAsync(["node", "eb", "whoami"]);
    assert.ok(lines.some((l) => l.includes("✓ authenticated")));
    assert.ok(lines.some((l) => l.includes("2 keys")));
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    global.fetch = previousFetch;
    console.log = previousLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("eb whoami exits with code 1 on invalid key", async () => {
  const tmpDir = path.join(os.tmpdir(), "eb-test-whoami-bad-" + Date.now());
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const previousExit = process.exit;
  const lines: string[] = [];
  let exitCode;
  process.env.XDG_CONFIG_HOME = tmpDir;
  console.log = (value) => lines.push(value);
  global.fetch = async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`process.exit:${code}`);
  };
  try {
    writeConfig({ url: "https://example.com", apiKey: "eb_bad" });
    await assert.rejects(
      createCli().parseAsync(["node", "eb", "whoami"]),
      /process\.exit:1/
    );
    assert.equal(exitCode, 1);
    assert.ok(lines.some((l) => l.includes("✗ Key invalid or expired")));
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    global.fetch = previousFetch;
    console.log = previousLog;
    process.exit = previousExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("readConfig ignores non-string fields in malformed config", () => {
  const tmpDir = path.join(os.tmpdir(), "eb-test-malformed-" + Date.now());
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;
  try {
    fs.mkdirSync(path.join(tmpDir, "evidence-browser"), { recursive: true });
    fs.writeFileSync(
      getConfigPath(),
      JSON.stringify({ url: {}, apiKey: 123, extra: "ignored" })
    );
    assert.deepEqual(readConfig(), {});
  } finally {
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
