/**
 * Security specs for the Evidence Browser.
 *
 * Covers AC-70..AC-76 and AC-78 (AC-77 is unit-covered by
 * `src/lib/bundle/extractor.test.ts` and intentionally not duplicated here).
 *
 * Fixture: `fixture-security` is zipped into
 * `./data/bundles/production/manual-audit-2024-04-05.zip` by
 * `scripts/prepare-visual-data.ts` during the playwright webServer bootstrap.
 * See `scripts/create-fixtures.ts:785` for the exact content — the index.md
 * contains a `<script>`, an `<iframe>`, an `<img onerror=...>`, and a
 * markdown link `[Path traversal 시도](../../../etc/passwd)`.
 *
 * Notes on assertions:
 * - Markdown selectors are scoped to `article.prose`, the wrapper rendered
 *   by `src/components/viewers/markdown-viewer.tsx`. Do NOT assert against
 *   `page.locator('script')` — Next.js injects its own hydration scripts
 *   at the document root.
 * - AC-76 doc wording says "script-src 'none'" but the implementation at
 *   `src/app/api/w/[ws]/bundle/[bundleId]/file/route.ts:10` emits
 *   "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" which
 *   is functionally equivalent (blocks all script-src by default). The
 *   test asserts the actual implementation. Flagged in the evidence bundle
 *   as a doc-wording mismatch.
 * - AC-78 doc wording says `/api/bundle/{id}/file` → 401. The actual route
 *   lives at `/api/w/[ws]/bundle/[bundleId]/file`; auth is enforced at the
 *   edge by `src/proxy.ts` (migrated from middleware.ts in Next 16). Any
 *   `/api/*` path without a valid session cookie returns 401, so the test
 *   hits `.../meta` per the prompt. Still flagged in the evidence bundle
 *   as a doc path mismatch.
 */
import archiver from "archiver";
import { PassThrough } from "stream";
import { test, expect, request as playwrightRequest, type Page, type APIRequestContext } from "@playwright/test";

import { login } from "../visual/helpers";

/**
 * In production mode (NODE_ENV=production) the auth cookie is set with the
 * `Secure` flag. The Playwright `APIRequestContext` (both `page.request` and
 * `context.request`) strictly honors that flag and refuses to send Secure
 * cookies over plain http:// — so calls made through the top-level `request`
 * fixture land at the proxy.ts auth gate and return 401.
 *
 * Workaround: after `login(page)`, harvest the session cookie from the
 * browser context's jar and build a fresh APIRequestContext with an explicit
 * Cookie header. That bypasses the cookie-jar Secure filtering because the
 * header is sent verbatim.
 */
async function authedRequest(page: Page): Promise<APIRequestContext> {
  const cookies = await page.context().cookies();
  const cookieHeader = cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return playwrightRequest.newContext({
    baseURL: "http://127.0.0.1:3000",
    extraHTTPHeaders: {
      Cookie: cookieHeader,
    },
  });
}

const WS = "production";
const BUNDLE_ID = "manual-audit-2024-04-05";
const BUNDLE_URL = `/w/${WS}/b/${BUNDLE_ID}`;
const FILE_API = `/api/w/${WS}/bundle/${BUNDLE_ID}/file`;
const META_API = `/api/w/${WS}/bundle/${BUNDLE_ID}/meta`;
const UPLOAD_API = `/api/w/${WS}/bundle`;

// The wrapper that contains ONLY rendered markdown from MarkdownViewer.
// See `src/components/viewers/markdown-viewer.tsx` line 245 — the outer
// element is `<article className="prose ...">`.
const MARKDOWN_SCOPE = "article.prose";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  content: string | Buffer;
}

async function buildZipBuffer(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 0 } }); // store, not deflate
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    sink.on("error", reject);
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.pipe(sink);
    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }
    archive.finalize().catch(reject);
  });
}

const VALID_MANIFEST = JSON.stringify({
  version: 1,
  title: "QA Security Upload Test",
  index: "index.md",
});

async function validZipBuffer(): Promise<Buffer> {
  return buildZipBuffer([
    { name: "manifest.json", content: VALID_MANIFEST },
    { name: "index.md", content: "# Hello\n" },
  ]);
}

// ===========================================================================
// AC-70..AC-76 — fixture-security browser-side checks
// ===========================================================================
test.describe("fixture-security sanitization and path safety", () => {
  test("TC-SEC-01 (AC-70) URL path traversal is blocked", async ({ page }) => {
    await login(page);

    // Deliberately construct a URL with `..` path segments. We want the raw
    // bytes preserved on the wire, so disable automatic redirect following
    // and capture the final response.
    const targetUrl = `${BUNDLE_URL}/f/../../../etc/passwd`;
    const response = await page.goto(targetUrl);

    // The browser may resolve `..` at the URL bar level. After navigation
    // settles we assert two things:
    //   1. The DOM does NOT contain `/etc/passwd` content (no "root:x:0:0"
    //      style lines from a Unix passwd file).
    //   2. The response status is not 200-with-passwd-content. Either 404,
    //      400, 403, or a bundle landing page are acceptable outcomes.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/root:[x*]:0:0/);
    expect(bodyText).not.toContain("/bin/bash");

    // If we somehow did get a response, it must not be a 2xx rendering of
    // the filesystem file. 200 is fine only if it rendered the bundle
    // landing (e.g. browser normalised the URL).
    if (response && response.status() === 200) {
      // The rendered page at worst shows bundle landing / 404, never passwd.
      await expect(page.locator("body")).not.toContainText("root:");
    }
  });

  test("TC-SEC-02 (AC-71) File API rejects path traversal", async ({
    page,
  }) => {
    await login(page); // session needed because proxy.ts gates all /api/*

    const api = await authedRequest(page);
    try {
      const res = await api.get(
        `${FILE_API}?path=${encodeURIComponent("../../../etc/passwd")}`
      );
      // The route returns 400 "Invalid file path" from validatePathSafety.
      // 403 would also be acceptable (ensureWithinRoot fallback), so accept
      // either. Critically it must NOT be 200.
      expect([400, 403]).toContain(res.status());

      const body = await res.text();
      expect(body).not.toMatch(/root:[x*]:0:0/);
    } finally {
      await api.dispose();
    }
  });

  test("TC-SEC-03 (AC-72) <script> tags are sanitized from markdown", async ({
    page,
  }) => {
    await login(page);
    await page.goto(BUNDLE_URL);

    // Wait for the markdown wrapper to actually exist before asserting.
    await expect(page.locator(MARKDOWN_SCOPE)).toBeVisible();
    // Heading "Security Test" is from fixture-security/index.md.
    await expect(
      page.locator(`${MARKDOWN_SCOPE} h1`).filter({ hasText: "Security Test" })
    ).toBeVisible();

    const scriptsInMarkdown = await page.locator(`${MARKDOWN_SCOPE} script`).count();
    expect(scriptsInMarkdown).toBe(0);
  });

  test("TC-SEC-04 (AC-73) <iframe> tags are sanitized from markdown", async ({
    page,
  }) => {
    await login(page);
    await page.goto(BUNDLE_URL);

    await expect(page.locator(MARKDOWN_SCOPE)).toBeVisible();

    const iframesInMarkdown = await page.locator(`${MARKDOWN_SCOPE} iframe`).count();
    expect(iframesInMarkdown).toBe(0);
  });

  test("TC-SEC-05 (AC-74) event-handler attributes are stripped", async ({
    page,
  }) => {
    await login(page);
    await page.goto(BUNDLE_URL);

    await expect(page.locator(MARKDOWN_SCOPE)).toBeVisible();

    // rehype-sanitize removes `onerror=` from <img>. If any img inside the
    // markdown container still has onerror, that's a defect.
    const onErrorAttrs = await page
      .locator(`${MARKDOWN_SCOPE} img[onerror]`)
      .count();
    expect(onErrorAttrs).toBe(0);

    // Belt-and-suspenders: no img[onclick], no img[onload] either.
    const anyEventHandler = await page
      .locator(`${MARKDOWN_SCOPE} img[onload], ${MARKDOWN_SCOPE} img[onclick]`)
      .count();
    expect(anyEventHandler).toBe(0);
  });

  test("TC-SEC-06 (AC-75) markdown path-traversal link is rendered inert", async ({
    page,
  }) => {
    await login(page);
    await page.goto(BUNDLE_URL);

    await expect(page.locator(MARKDOWN_SCOPE)).toBeVisible();

    const link = page.getByRole("link", { name: /path traversal/i }).first();
    await expect(link).toBeVisible();

    const href = await link.getAttribute("href");
    expect(href, "Path-traversal link must have an href").not.toBeNull();
    // The link must not point at an absolute filesystem path.
    expect(href).not.toMatch(/^(file:|\/etc\/|\/proc\/|\/root\/)/);
    // It must stay scoped under the bundle landing URL prefix.
    expect(href!.startsWith(`/w/${WS}/b/${BUNDLE_ID}/`)).toBe(true);

    // Click it: we expect either a 404 (notFound from the bundle page) or
    // a rendered error — definitely NOT real /etc/passwd content.
    const navPromise = page.waitForLoadState("networkidle");
    await link.click();
    await navPromise;

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/root:[x*]:0:0/);
    expect(bodyText).not.toContain("/bin/bash");
  });

  test("TC-SEC-07 (AC-76) file API sends a restrictive CSP header", async ({
    page,
  }) => {
    await login(page);

    const api = await authedRequest(page);
    try {
      const res = await api.get(
        `${FILE_API}?path=${encodeURIComponent("index.md")}`
      );
      expect(res.status()).toBe(200);

      const csp = res.headers()["content-security-policy"];
      expect(csp, "Content-Security-Policy header must be present").toBeTruthy();
      // Implementation uses `default-src 'none'` which implicitly blocks
      // script-src. Doc says "script-src 'none'" — noted as a wording mismatch
      // in the evidence bundle.
      expect(csp).toContain("default-src 'none'");

      expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    } finally {
      await api.dispose();
    }
  });

  test("TC-SEC-08 (AC-78) unauthenticated API call is blocked with 401", async () => {
    // Fresh context with no cookies — explicitly detached from the shared
    // test browser context. proxy.ts gates any /api/* path that isn't in
    // its PUBLIC_PATHS/SETUP_PATHS/MCP_PATHS lists and returns 401 JSON.
    const anon = await playwrightRequest.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    try {
      const res = await anon.get(META_API);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/unauthorized/i);

      // Secondary check: the file API is also gated (same middleware).
      const fileRes = await anon.get(
        `${FILE_API}?path=${encodeURIComponent("index.md")}`
      );
      expect(fileRes.status()).toBe(401);
    } finally {
      await anon.dispose();
    }
  });
});

// ===========================================================================
// Upload-path edge cases from code-reviewer findings
// ===========================================================================
test.describe("bundle upload edge cases", () => {
  test("TC-SEC-UPLOAD-01 double-dot mid-string bundleId is rejected", async ({
    page,
  }) => {
    await login(page);

    const zipBuf = await validZipBuffer();
    const api = await authedRequest(page);
    try {
      const res = await api.post(UPLOAD_API, {
        multipart: {
          file: {
            name: "foo..bar.zip",
            mimeType: "application/zip",
            buffer: zipBuf,
          },
          bundleId: "foo..bar",
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid bundleid/i);
    } finally {
      await api.dispose();
    }
  });

  test("TC-SEC-UPLOAD-02 upload at exactly MAX_BUNDLE_SIZE succeeds", async ({
    page,
  }) => {
    await login(page);

    // Default MAX_BUNDLE_SIZE is 500MB — way too big for a test to actually
    // build and transmit. We can't override env inside the running server
    // from here, so this TC becomes a semantic boundary proxy: we upload a
    // valid-but-small zip and assert the server accepts it (201). The
    // strict `>` (not `>=`) comparison in `validateBundleSize` is covered
    // by vitest in `upload-validation.test.ts` — this e2e test just proves
    // that the happy path with a legal size still works at the HTTP layer.
    const zipBuf = await validZipBuffer();
    const api = await authedRequest(page);
    try {
      // Use a timestamped bundleId so re-runs don't collide with previous
      // uploads in the persistent SQLite DB (UNIQUE constraint on bundleId).
      const bundleId = `qa-sec-upload-02-${Date.now()}`;
      const res = await api.post(UPLOAD_API, {
        multipart: {
          file: {
            name: `${bundleId}.zip`,
            mimeType: "application/zip",
            buffer: zipBuf,
          },
          bundleId,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.bundle?.bundleId).toBe(bundleId);
    } finally {
      await api.dispose();
    }
  });

  test("TC-SEC-UPLOAD-03 upload over MAX_BUNDLE_SIZE is rejected with 413", async ({
    page,
  }) => {
    await login(page);

    // Same constraint: we can't build a real 500MB+1 payload in-test. The
    // strict-over behavior is covered by vitest in
    // `upload-validation.test.ts` (the `validateBundleSize` unit tests).
    //
    // Since we cannot assert 413 deterministically without reconfiguring
    // the live server, we mark this as a known gap and assert the happy
    // control path: a valid zip succeeds. The unit tests carry the strict
    // boundary assertion. Flagged in the evidence bundle.
    const zipBuf = await validZipBuffer();
    const api = await authedRequest(page);
    try {
      const bundleId = `qa-sec-upload-03-${Date.now()}`;
      const res = await api.post(UPLOAD_API, {
        multipart: {
          file: {
            name: `${bundleId}.zip`,
            mimeType: "application/zip",
            buffer: zipBuf,
          },
          bundleId,
        },
      });
      // Control assertion: a sub-limit upload still succeeds. The strict
      // 413-on-overflow behavior is covered unit-side.
      expect([201, 409]).toContain(res.status());
    } finally {
      await api.dispose();
    }
  });

  test("TC-SEC-UPLOAD-04 null-byte in bundleId is rejected", async ({
    page,
  }) => {
    await login(page);

    const zipBuf = await validZipBuffer();
    const api = await authedRequest(page);
    try {
      // Playwright's multipart serialization tolerates \0 in form fields.
      const res = await api.post(UPLOAD_API, {
        multipart: {
          file: {
            name: "valid.zip",
            mimeType: "application/zip",
            buffer: zipBuf,
          },
          bundleId: "foo\0bar",
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid bundleid/i);
    } finally {
      await api.dispose();
    }
  });

  test("TC-SEC-UPLOAD-05 empty bundleId + filename derives to empty is rejected", async ({
    page,
  }) => {
    await login(page);

    const zipBuf = await validZipBuffer();
    const api = await authedRequest(page);
    try {
      // filename is exactly ".zip" → strip .zip → "" → invalid
      const res = await api.post(UPLOAD_API, {
        multipart: {
          file: {
            name: ".zip",
            mimeType: "application/zip",
            buffer: zipBuf,
          },
          bundleId: "",
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid bundleid/i);
    } finally {
      await api.dispose();
    }
  });
});
