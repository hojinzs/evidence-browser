import { expect, test } from "@playwright/test";

interface ZipFixtureEntry {
  name: string;
  content: string;
}

const cspHeader = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "style-src 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const invalidBundleIds = [
  { value: "../bad", label: "path traversal" },
  { value: "foo..bar", label: "mid-string dot dot" },
  { value: "nested/bundle", label: "slash" },
  { value: "nested\\bundle", label: "backslash" },
  { value: "foo\0bar", label: "null byte" },
  { value: "Uppercase", label: "uppercase" },
  { value: "space id", label: "space" },
  { value: "encoded%2fslash", label: "encoded slash" },
];

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf-8");
    const data = Buffer.from(entry.content, "utf-8");
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.byteLength, 18);
    localHeader.writeUInt32LE(data.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.byteLength, 20);
    centralHeader.writeUInt32LE(data.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.byteLength + name.byteLength + data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function makeBundleZip(title = "Security Fixture"): Buffer {
  return makeZip([
    {
      name: "manifest.json",
      content: JSON.stringify({ version: 1, title, index: "index.md" }),
    },
    {
      name: "index.md",
      content: "# Security Fixture\n\n[HTML report](reports/malicious.html)\n",
    },
    {
      name: "reports/malicious.html",
      content:
        '<!doctype html><script>window.evidencePwned = true</script><iframe src="https://evil.example"></iframe><h1>HTML Report</h1>',
    },
    { name: "logs/app.log", content: "safe log output" },
  ]);
}

function makeMarkdownXssBundleZip(): Buffer {
  return makeZip([
    {
      name: "manifest.json",
      content: JSON.stringify({ version: 1, title: "Sanitized Markdown", index: "index.md" }),
    },
    {
      name: "index.md",
      content: [
        "# Sanitized Markdown",
        "",
        "Trusted markdown content remains visible.",
        "",
        "<script>window.evidencePwned = true</script>",
        '<iframe src="https://evil.example"></iframe>',
        '<img src="x" onerror="window.evidencePwned = true">',
      ].join("\n"),
    },
  ]);
}

test.describe("security and upload edge cases", () => {
  test("rejects malicious bundle IDs before storing metadata", async ({ request }) => {
    const workspaceSlug = `security-ids-${Date.now()}`;
    const workspaceResponse = await request.post("/api/w", {
      data: {
        slug: workspaceSlug,
        name: "Security ID Workspace",
        description: "Playwright security bundle ID coverage",
      },
    });
    expect(workspaceResponse.status()).toBe(201);

    for (const bundleId of invalidBundleIds) {
      const uploadResponse = await request.post(`/api/w/${workspaceSlug}/bundle`, {
        multipart: {
          bundleId: bundleId.value,
          file: {
            name: `${bundleId.label.replaceAll(" ", "-")}.zip`,
            mimeType: "application/zip",
            buffer: makeBundleZip(),
          },
        },
      });

      expect.soft(uploadResponse.status(), bundleId.label).toBe(400);
      await expect.soft(uploadResponse.json(), bundleId.label).resolves.toEqual({
        error: "Invalid bundleId",
      });
    }

    const emptyDerivedBundleIdResponse = await request.post(`/api/w/${workspaceSlug}/bundle`, {
      multipart: {
        file: {
          name: ".zip",
          mimeType: "application/zip",
          buffer: makeBundleZip(),
        },
      },
    });
    expect(emptyDerivedBundleIdResponse.status()).toBe(400);
    await expect(emptyDerivedBundleIdResponse.json()).resolves.toEqual({
      error: "Invalid bundleId",
    });

    const listResponse = await request.get(`/api/w/${workspaceSlug}/bundle`);
    expect(listResponse.status()).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({ bundles: [] });
  });

  test("rejects invalid upload ZIPs with actionable 4xx errors", async ({ request }) => {
    const workspaceSlug = `security-upload-${Date.now()}`;
    const workspaceResponse = await request.post("/api/w", {
      data: {
        slug: workspaceSlug,
        name: "Security Upload Workspace",
        description: "Playwright invalid upload coverage",
      },
    });
    expect(workspaceResponse.status()).toBe(201);

    const missingManifestResponse = await request.post(`/api/w/${workspaceSlug}/bundle`, {
      multipart: {
        bundleId: "missing-manifest",
        file: {
          name: "missing-manifest.zip",
          mimeType: "application/zip",
          buffer: makeZip([{ name: "index.md", content: "# Missing manifest\n" }]),
        },
      },
    });
    expect(missingManifestResponse.status()).toBe(400);
    await expect(missingManifestResponse.json()).resolves.toEqual({
      error: "manifest.json was not found",
    });

    const missingIndexResponse = await request.post(`/api/w/${workspaceSlug}/bundle`, {
      multipart: {
        bundleId: "missing-index",
        file: {
          name: "missing-index.zip",
          mimeType: "application/zip",
          buffer: makeZip([
            {
              name: "manifest.json",
              content: JSON.stringify({ version: 1, title: "Missing index", index: "index.md" }),
            },
            { name: "other.md", content: "# Other\n" },
          ]),
        },
      },
    });
    expect(missingIndexResponse.status()).toBe(400);
    await expect(missingIndexResponse.json()).resolves.toEqual({
      error: "Index file not found: index.md",
    });

    const listResponse = await request.get(`/api/w/${workspaceSlug}/bundle`);
    expect(listResponse.status()).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({ bundles: [] });
  });

  test("blocks traversal reads and serves uploaded content with restrictive headers", async ({
    request,
  }) => {
    const workspaceSlug = `security-read-${Date.now()}`;
    const bundleId = "security-fixture";

    const workspaceResponse = await request.post("/api/w", {
      data: {
        slug: workspaceSlug,
        name: "Security Read Workspace",
        description: "Playwright secure read coverage",
      },
    });
    expect(workspaceResponse.status()).toBe(201);

    const uploadResponse = await request.post(`/api/w/${workspaceSlug}/bundle`, {
      multipart: {
        bundleId,
        file: {
          name: "security-fixture.zip",
          mimeType: "application/zip",
          buffer: makeBundleZip("Security Fixture"),
        },
      },
    });
    expect(uploadResponse.status()).toBe(201);
    await expect(uploadResponse.json()).resolves.toMatchObject({
      bundle: {
        bundle_id: bundleId,
        storage_key: `${workspaceSlug}/${bundleId}`,
        title: "Security Fixture",
      },
    });

    const traversalFileResponse = await request.get(
      `/api/w/${workspaceSlug}/bundles/${bundleId}/file?path=..%2Fsecret.txt`
    );
    expect(traversalFileResponse.status()).toBe(400);
    await expect(traversalFileResponse.json()).resolves.toEqual({ error: "Invalid file path" });

    const logResponse = await request.get(
      `/api/w/${workspaceSlug}/bundles/${bundleId}/file?path=logs%2Fapp.log`
    );
    expect(logResponse.status()).toBe(200);
    expect(logResponse.headers()["content-security-policy"]).toBe(
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    );
    expect(logResponse.headers()["x-content-type-options"]).toBe("nosniff");
    await expect(logResponse.text()).resolves.toBe("safe log output");

    const htmlResponse = await request.get(
      `/api/w/${workspaceSlug}/bundles/${bundleId}/preview?path=reports%2Fmalicious.html`
    );
    expect(htmlResponse.status()).toBe(200);
    expect(htmlResponse.headers()["content-security-policy"]).toBe(cspHeader);
    expect(htmlResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(htmlResponse.headers()["referrer-policy"]).toBe("no-referrer");
    const html = await htmlResponse.text();
    expect(html).toContain("<script>window.evidencePwned = true</script>");
    const responseCspHeader = htmlResponse.headers()["content-security-policy"];
    expect(responseCspHeader).toContain("script-src 'none'");
    expect(responseCspHeader).toContain("frame-src 'none'");
    expect(responseCspHeader).not.toContain("https:");
  });

  test("sanitizes uploaded markdown before rendering it in the browser DOM", async ({
    page,
    request,
  }) => {
    const workspaceSlug = `security-markdown-${Date.now()}`;
    const bundleId = "markdown-xss";

    const workspaceResponse = await request.post("/api/w", {
      data: {
        slug: workspaceSlug,
        name: "Security Markdown Workspace",
        description: "Playwright markdown sanitization coverage",
      },
    });
    expect(workspaceResponse.status()).toBe(201);

    const uploadResponse = await request.post(`/api/w/${workspaceSlug}/bundle`, {
      multipart: {
        bundleId,
        file: {
          name: "markdown-xss.zip",
          mimeType: "application/zip",
          buffer: makeMarkdownXssBundleZip(),
        },
      },
    });
    expect(uploadResponse.status()).toBe(201);
    await expect(uploadResponse.json()).resolves.toMatchObject({
      bundle: {
        bundle_id: bundleId,
        title: "Sanitized Markdown",
      },
    });

    await page.goto(`/w/${workspaceSlug}/b/${bundleId}`);

    await expect(page.getByRole("heading", { name: "Sanitized Markdown" })).toBeVisible();
    await expect(page.getByText("Trusted markdown content remains visible.")).toBeVisible();

    const markdown = page.locator("article");
    await expect(markdown.locator("script")).toHaveCount(0);
    await expect(markdown.locator("iframe")).toHaveCount(0);
    await expect(markdown.locator("[onerror]")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => (window as typeof window & { evidencePwned?: boolean }).evidencePwned))
      .toBeUndefined();
  });
});
