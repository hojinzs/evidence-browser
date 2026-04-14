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
      description: "",
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

test("deleteWorkspace resolves the slug before issuing the delete request", async () => {
  const { deleteWorkspace } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;
  const requests = [];

  global.fetch = async (url, init = {}) => {
    requests.push({ url, init });

    if (requests.length === 1) {
      return new Response(
        JSON.stringify({ workspaces: [{ id: "ws_1", slug: "demo", name: "Demo" }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

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
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "https://eb.example.com/api/w");
    assert.equal(requests[1].url, "https://eb.example.com/api/w");
    assert.equal(requests[1].init.method, "DELETE");
    assert.ok(requests[1].init.headers instanceof Headers);
    assert.equal(requests[1].init.headers.get("Authorization"), "Bearer eb_admin");
    assert.equal(requests[1].init.headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(requests[1].init.body), { id: "ws_1" });
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
