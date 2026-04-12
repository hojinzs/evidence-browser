import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const BUNDLES_DIR = path.resolve("./data/bundles");
const BUCKET = process.env.S3_BUCKET || "evidence-test";
const ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "minioadmin",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "minioadmin",
  },
});

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`  Created bucket: ${BUCKET}`);
  }
}

async function uploadFile(localPath: string, key: string) {
  const body = fs.readFileSync(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
    })
  );
}

function walkZips(dir: string, prefix = ""): { localPath: string; key: string }[] {
  const results: { localPath: string; key: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relKey = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      results.push(...walkZips(fullPath, relKey));
    } else if (entry.name.endsWith(".zip")) {
      results.push({ localPath: fullPath, key: relKey });
    }
  }
  return results;
}

async function main() {
  if (!fs.existsSync(BUNDLES_DIR)) {
    console.error(
      "No local bundles found. Run `npm run seed` first to create zip files."
    );
    process.exit(1);
  }

  console.log(`Uploading bundles to S3 (${ENDPOINT})...\n`);

  await ensureBucket();

  const zips = walkZips(BUNDLES_DIR);
  for (const { localPath, key } of zips) {
    await uploadFile(localPath, key);
    console.log(`  OK: ${key}`);
  }

  console.log(`\nUploaded ${zips.length} bundles to bucket '${BUCKET}'.`);
}

main().catch((err) => {
  console.error("S3 seed failed:", err);
  process.exit(1);
});
