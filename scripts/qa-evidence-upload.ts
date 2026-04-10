/**
 * QA Evidence Upload Helper
 *
 * Packages a .evidence/{session}/ directory into a ZIP, logs in as the
 * QA admin, and uploads the bundle to the local Evidence Browser instance.
 *
 * Usage:
 *   npx tsx scripts/qa-evidence-upload.ts .evidence/{session}
 *
 * Env (read from .env.local / process.env):
 *   QA_BASE_URL           default: http://127.0.0.1:3000
 *   QA_WORKSPACE_SLUG     default: default
 *   QA_ADMIN_USERNAME     required — matches POST /api/auth/login { username }
 *   QA_ADMIN_PASSWORD     required
 *
 * Prints the bundle URL on success. Exits non-zero on any failure.
 *
 * Contract notes:
 *   - bundleId = basename of session directory. Must not contain `/`, `..`, `\0`
 *     (enforced by src/app/api/w/[ws]/bundle/route.ts).
 *   - manifest.json must validate per src/lib/bundle/extractor.ts.
 *   - Admin session cookie required (requireAdminFromRequest).
 */
import archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";

interface UploadConfig {
  baseUrl: string;
  workspaceSlug: string;
  username: string;
  password: string;
}

function readConfig(): UploadConfig {
  const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
  const workspaceSlug = process.env.QA_WORKSPACE_SLUG ?? "default";
  const username = process.env.QA_ADMIN_USERNAME;
  const password = process.env.QA_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "QA_ADMIN_USERNAME and QA_ADMIN_PASSWORD must be set in env (.env.local)"
    );
  }

  return { baseUrl, workspaceSlug, username, password };
}

function validateSessionId(id: string): void {
  if (!id || id.includes("/") || id.includes("..") || id.includes("\0")) {
    throw new Error(
      `Invalid session ID "${id}": must not contain '/', '..', or null bytes`
    );
  }
}

async function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function login(
  config: UploadConfig
): Promise<string> {
  const url = `${config.baseUrl}/api/auth/login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Login failed: ${res.status} ${res.statusText} — ${text}`
    );
  }

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Login response did not include a set-cookie header");
  }

  // Extract evidence_session=... from the Set-Cookie header
  const match = setCookie.match(/evidence_session=([^;]+)/);
  if (!match) {
    throw new Error(
      `Login response set-cookie did not include evidence_session: ${setCookie}`
    );
  }

  return `evidence_session=${match[1]}`;
}

async function uploadBundle(
  config: UploadConfig,
  cookie: string,
  zipPath: string,
  bundleId: string
): Promise<{ bundleUrl: string; bundle: unknown }> {
  const buffer = fs.readFileSync(zipPath);
  // Node 20+ has global File and FormData
  const file = new File([buffer], `${bundleId}.zip`, {
    type: "application/zip",
  });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("bundleId", bundleId);

  const url = `${config.baseUrl}/api/w/${config.workspaceSlug}/bundle`;
  const res = await fetch(url, {
    method: "POST",
    headers: { cookie },
    body: formData,
  });

  const bodyText = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }

  if (!res.ok) {
    throw new Error(
      `Upload failed: ${res.status} ${res.statusText} — ${bodyText}`
    );
  }

  // Viewer route is /w/{ws}/b/{bundleId} (see src/lib/url.ts::bundleLandingUrl)
  const encodedBundleId = encodeURIComponent(bundleId);
  const bundleUrl = `${config.baseUrl}/w/${config.workspaceSlug}/b/${encodedBundleId}`;

  return { bundleUrl, bundle: body };
}

async function main() {
  const [, , sessionDirArg] = process.argv;
  if (!sessionDirArg) {
    console.error(
      "Usage: npx tsx scripts/qa-evidence-upload.ts .evidence/{session}"
    );
    process.exit(2);
  }

  const sessionDir = path.resolve(sessionDirArg);
  if (!fs.existsSync(sessionDir) || !fs.statSync(sessionDir).isDirectory()) {
    console.error(`Not a directory: ${sessionDir}`);
    process.exit(2);
  }

  const bundleId = path.basename(sessionDir);
  validateSessionId(bundleId);

  // Sanity check: manifest.json and index.md must exist (mirrors server-side validator)
  const manifestPath = path.join(sessionDir, "manifest.json");
  const indexPath = path.join(sessionDir, "index.md");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Missing required file: ${manifestPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(indexPath)) {
    console.error(`Missing required file: ${indexPath}`);
    process.exit(2);
  }

  const config = readConfig();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-evidence-"));
  const zipPath = path.join(tmpDir, `${bundleId}.zip`);

  try {
    console.log(`[qa-evidence-upload] Packaging ${sessionDir} → ${zipPath}`);
    await zipDirectory(sessionDir, zipPath);
    const sizeBytes = fs.statSync(zipPath).size;
    console.log(
      `[qa-evidence-upload] Packaged ${sizeBytes} bytes (bundleId=${bundleId})`
    );

    console.log(
      `[qa-evidence-upload] Logging in as ${config.username} at ${config.baseUrl}`
    );
    const cookie = await login(config);

    console.log(
      `[qa-evidence-upload] Uploading to workspace "${config.workspaceSlug}"`
    );
    const { bundleUrl, bundle } = await uploadBundle(
      config,
      cookie,
      zipPath,
      bundleId
    );

    console.log("[qa-evidence-upload] Upload OK");
    console.log(JSON.stringify({ bundleUrl, bundle }, null, 2));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(
    `[qa-evidence-upload] ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
});
