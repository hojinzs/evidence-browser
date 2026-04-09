import archiver from "archiver";
import fs from "fs";
import path from "path";

import { createBundle } from "@/lib/db/bundles";
import { getDb, resetDb } from "@/lib/db";
import { createUser } from "@/lib/db/users";
import { createWorkspace } from "@/lib/db/workspaces";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures");
const DATA_DIR = path.resolve(process.cwd(), "data");
const BUNDLES_DIR = path.join(DATA_DIR, "bundles");

async function createZip(sourceDir: string, outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export async function seedVisualData(): Promise<void> {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  resetDb();

  process.env.DATA_DIR = "./data";
  process.env.STORAGE_LOCAL_PATH = "./data/bundles";
  process.env.AUTH_SECRET = "test-secret";

  const admin = await createUser("admin", "admin123", "admin");
  await createUser("steve", "steve123", "user");
  await createUser("ci-bot", "ci-bot123", "user");
  await createUser("auditor", "auditor123", "user");

  const production = createWorkspace(
    "production",
    "Production",
    "Live environment evidence and audit trails.",
    admin.id
  );
  createWorkspace(
    "staging",
    "Staging",
    "Pre-release verification and QA reports.",
    admin.id
  );
  createWorkspace(
    "security-audits",
    "Security Audits",
    "Penetration tests and compliance scans.",
    admin.id
  );
  createWorkspace(
    "ci-pipeline",
    "CI Pipeline",
    "Automated test results from CI runs.",
    admin.id
  );
  createWorkspace(
    "compliance",
    "Compliance",
    "Regulatory compliance documentation.",
    admin.id
  );

  const bundleDefs = [
    {
      id: "ci-run-2024-04-08",
      title: "CI Run - v1.2.3 - April 8, 2024",
      fixture: "fixture-markdown-rich",
      createdAt: "2024-04-08 14:32:00",
      sizeBytes: 2_400_000,
    },
    {
      id: "ci-run-2024-04-07",
      title: "CI Run - v1.2.2 - April 7, 2024",
      fixture: "fixture-basic",
      createdAt: "2024-04-07 13:24:00",
      sizeBytes: 2_100_000,
    },
    {
      id: "manual-audit-2024-04-05",
      title: "Manual Audit - April 5, 2024",
      fixture: "fixture-security",
      createdAt: "2024-04-05 11:10:00",
      sizeBytes: 8_900_000,
    },
    {
      id: "compliance-scan-q1-2024",
      title: "Compliance Scan Q1 2024",
      fixture: "fixture-binary",
      createdAt: "2024-04-01 09:15:00",
      sizeBytes: 1_300_000,
    },
  ];

  for (const bundle of bundleDefs) {
    const storageKey = `production/${bundle.id}`;
    await createZip(
      path.join(FIXTURES_DIR, bundle.fixture),
      path.join(BUNDLES_DIR, `${storageKey}.zip`)
    );
    createBundle({
      bundleId: bundle.id,
      workspaceId: production.id,
      title: bundle.title,
      storageKey,
      sizeBytes: bundle.sizeBytes,
      uploadedBy: admin.id,
    });
  }

  const db = getDb();
  db.prepare(`UPDATE users SET created_at = ?, updated_at = ? WHERE username = ?`).run(
    "2024-04-01 09:00:00",
    "2024-04-08 14:32:00",
    "admin"
  );
  db.prepare(`UPDATE users SET created_at = ?, updated_at = ? WHERE username = ?`).run(
    "2024-04-01 10:00:00",
    "2024-04-08 13:15:00",
    "steve"
  );
  db.prepare(`UPDATE users SET created_at = ?, updated_at = ? WHERE username = ?`).run(
    "2024-04-01 11:00:00",
    "2024-04-08 14:32:00",
    "ci-bot"
  );
  db.prepare(`UPDATE users SET created_at = ?, updated_at = ? WHERE username = ?`).run(
    "2024-04-01 12:00:00",
    "2024-04-05 08:00:00",
    "auditor"
  );

  db.prepare(`UPDATE workspaces SET created_at = ?, updated_at = ? WHERE slug = ?`).run(
    "2024-01-15 00:00:00",
    "2024-04-08 14:32:00",
    "production"
  );
  db.prepare(`UPDATE workspaces SET created_at = ?, updated_at = ? WHERE slug = ?`).run(
    "2024-01-20 00:00:00",
    "2024-04-02 10:00:00",
    "staging"
  );
  db.prepare(`UPDATE workspaces SET created_at = ?, updated_at = ? WHERE slug = ?`).run(
    "2024-02-03 00:00:00",
    "2024-04-03 10:00:00",
    "security-audits"
  );
  db.prepare(`UPDATE workspaces SET created_at = ?, updated_at = ? WHERE slug = ?`).run(
    "2024-03-01 00:00:00",
    "2024-04-04 10:00:00",
    "ci-pipeline"
  );
  db.prepare(`UPDATE workspaces SET created_at = ?, updated_at = ? WHERE slug = ?`).run(
    "2024-04-01 00:00:00",
    "2024-04-05 10:00:00",
    "compliance"
  );

  for (const bundle of bundleDefs) {
    db.prepare(`UPDATE bundles SET created_at = ? WHERE bundle_id = ?`).run(
      bundle.createdAt,
      bundle.id
    );
  }
}
