const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");

function restoreEnv(name, previousValue) {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = previousValue;
}

test("resolveServerOptions falls back to environment variables", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_test";

  try {
    const { resolveServerOptions } = require("../dist/lib/command-options.js");
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
  const { listBundles } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundle");
    assert.ok(init.headers instanceof Headers);
    assert.equal(init.headers.get("Authorization"), "Bearer eb_read");
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
  const { listBundles } = require("../dist/lib/api-client.js");
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

test("listWorkspaces sends bearer auth to the workspace list endpoint", async () => {
  const { listWorkspaces } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w");
    assert.ok(init.headers instanceof Headers);
    assert.equal(init.headers.get("Authorization"), "Bearer eb_read");
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
  const { createWorkspace } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w");
    assert.equal(init.method, "POST");
    assert.ok(init.headers instanceof Headers);
    assert.equal(init.headers.get("Authorization"), "Bearer eb_admin");
    assert.equal(init.headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(init.body), {
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
  const { createWorkspace } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;

  global.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), {
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
  const { deleteWorkspace } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;

  global.fetch = async (url, init = {}) => {
    assert.equal(url, "https://eb.example.com/api/w/demo");
    assert.equal(init.method, "DELETE");
    assert.ok(init.headers instanceof Headers);
    assert.equal(init.headers.get("Authorization"), "Bearer eb_admin");
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
  const { updateWorkspace } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;
  const requests = [];

  global.fetch = async (url, init) => {
    requests.push(url);

    if (url === "https://eb.example.com/api/w/demo") {
      assert.ok(init.headers instanceof Headers);
      assert.equal(init.headers.get("Authorization"), "Bearer eb_admin");
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
    assert.equal(init.method, "PATCH");
    assert.ok(init.headers instanceof Headers);
    assert.equal(init.headers.get("Authorization"), "Bearer eb_admin");
    assert.equal(init.headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(init.body), {
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

test("downloadBundleFile encodes the nested file path", async () => {
  const { downloadBundleFile } = require("../dist/lib/api-client.js");
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
  const { deleteBundle } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundles/bundle-1");
    assert.equal(init.method, "DELETE");
    assert.ok(init.headers instanceof Headers);
    assert.equal(init.headers.get("Authorization"), "Bearer eb_write");
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
  const { confirmBundleDeletion } = require("../dist/commands/bundle.js");
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

  const lines = [];
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
    const { createCli } = require("../dist/index.js");
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
  const lines = [];

  console.log = (value) => lines.push(value);
  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundles/bundle-1");
    assert.equal(init.method, "DELETE");
    return new Response(null, { status: 204 });
  };

  try {
    const { createCli } = require("../dist/index.js");
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

test("workspace create command uses environment-backed server options and prints JSON", async () => {
  const previousUrl = process.env.EB_URL;
  const previousApiKey = process.env.EB_API_KEY;
  const previousFetch = global.fetch;
  const previousLog = console.log;

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";

  const lines = [];
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
    const { createCli } = require("../dist/index.js");
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
    assert.deepEqual(JSON.parse(init.body), {
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
    const { createCli } = require("../dist/index.js");
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
  const requests = [];

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";

  const lines = [];
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
    const { createCli } = require("../dist/index.js");
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
  const errors = [];
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
    const { createCli } = require("../dist/index.js");
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
  const errors = [];
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
    const { createCli } = require("../dist/index.js");
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
  const lines = [];

  process.env.EB_URL = "https://eb.example.com";
  process.env.EB_API_KEY = "eb_admin";
  console.log = (value) => lines.push(value);
  global.fetch = async (url, init = {}) => {
    assert.equal(url, "https://eb.example.com/api/w/demo");
    assert.equal(init.method, "DELETE");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const { createCli } = require("../dist/index.js");
    await createCli().parseAsync(["node", "eb", "workspace", "delete", "demo", "--force"]);
    assert.deepEqual(lines, ["Deleted workspace: demo"]);
  } finally {
    restoreEnv("EB_URL", previousUrl);
    restoreEnv("EB_API_KEY", previousApiKey);
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});
