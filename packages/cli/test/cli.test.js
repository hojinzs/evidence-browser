const test = require("node:test");
const assert = require("node:assert/strict");

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
    process.env.EB_URL = previousUrl;
    process.env.EB_API_KEY = previousApiKey;
  }
});

test("listBundles sends bearer auth to the bundle list endpoint", async () => {
  const { listBundles } = require("../dist/lib/api-client.js");
  const previousFetch = global.fetch;

  global.fetch = async (url, init) => {
    assert.equal(url, "https://eb.example.com/api/w/demo/bundle");
    assert.equal(init.headers.Authorization, "Bearer eb_read");
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
    process.env.EB_URL = previousUrl;
    process.env.EB_API_KEY = previousApiKey;
    global.fetch = previousFetch;
    console.log = previousLog;
  }
});
