/**
 * create-fixtures.ts
 *
 * Creates all test fixture directories and files for the Evidence Browser project.
 * Binary files (PNG, JPEG, GIF, PDF, gzip, random bytes) are generated here.
 * Text files are also created here for a single source of truth.
 *
 * Usage:  npx tsx scripts/create-fixtures.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const FIXTURES_ROOT = path.resolve(__dirname, "..", "fixtures");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeText(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeBinary(filePath: string, data: Buffer) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data);
}

function fixtureDir(name: string) {
  return path.join(FIXTURES_ROOT, name);
}

// ---------------------------------------------------------------------------
// Binary blobs
// ---------------------------------------------------------------------------

const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
  0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x36, 0x28, 0x19, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3f, 0x00, 0x7b, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0xff,
  0xd9,
]);

const MINIMAL_GIF = Buffer.from(
  "GIF89a\x01\x00\x01\x00\x00\x00\x00;\x00",
  "binary",
);

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
  "utf-8",
);

const MINIMAL_GZIP = Buffer.from([
  0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x03, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const SIMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4A90D9"/></svg>`;

// ---------------------------------------------------------------------------
// 1. fixture-basic
// ---------------------------------------------------------------------------
function createFixtureBasic() {
  const dir = fixtureDir("fixture-basic");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "Basic Test", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(
    path.join(dir, "index.md"),
    `# Basic Test Evidence

## 요약
테스트가 성공적으로 완료되었습니다.

## 로그
- [앱 로그](logs/app.log)
- [에러 로그](logs/error.log)

## 스크린샷
![Step 1](screenshots/step-1.png)
![Step 2](screenshots/step-2.jpg)

## 스크립트
- [Setup](scripts/setup.sh)
- [Test](scripts/test.py)

## 결과
- [Output JSON](results/output.json)
- [상세 노트](notes.md)

## 외부 링크
- [GitHub PR](https://github.com/example/repo/pull/182)

## GFM 기능
| 항목 | 결과 |
|------|------|
| 테스트 A | 통과 |
| 테스트 B | 실패 |

- [x] Step 1 완료
- [ ] Step 2 보류
- ~~취소된 항목~~

> 인용문 테스트

\`인라인 코드\` 테스트
`,
  );

  // logs/app.log — 200 lines
  const logLevels = ["INFO", "DEBUG", "WARN", "INFO", "INFO", "DEBUG"];
  const logModules = [
    "app.server",
    "db.pool",
    "auth.session",
    "api.handler",
    "cache.redis",
    "worker.queue",
    "middleware.cors",
    "config.loader",
  ];
  const logMessages = [
    "Request handled successfully",
    "Connection pool acquired connection #%d",
    "Session token refreshed for user_id=%d",
    "Processing API request GET /api/v1/evidence/%d",
    "Cache hit ratio: %d%%",
    "Background job enqueued: job_id=%d",
    "CORS preflight for origin https://app.example.com",
    "Configuration reloaded from environment",
    "Database query executed in %dms",
    "WebSocket connection established: ws_id=%d",
    "Rate limiter: %d requests remaining for client 10.0.1.%d",
    "File upload completed: %d bytes written",
    "Health check passed: uptime=%ds",
    "Graceful shutdown signal received",
    "TLS handshake completed with cipher TLS_AES_256_GCM_SHA384",
    "Memory usage: heap_used=%dMB heap_total=%dMB",
    "Garbage collection pause: %dms",
    "HTTP/2 stream multiplexed: stream_id=%d",
    "JWT token validated: exp=%d",
    "Static asset served: /assets/bundle-%d.js",
  ];

  const appLogLines: string[] = [];
  const baseDate = new Date("2026-03-29T08:00:00Z");
  for (let i = 0; i < 200; i++) {
    const ts = new Date(baseDate.getTime() + i * 1500);
    const isoTs = ts.toISOString();
    const level = logLevels[i % logLevels.length];
    const mod = logModules[i % logModules.length];
    const msgTemplate = logMessages[i % logMessages.length];
    const msg = msgTemplate
      .replace(/%d/g, () => String(Math.floor(Math.random() * 9999) + 1));
    appLogLines.push(`${isoTs} [${level}] ${mod}: ${msg}`);
  }
  writeText(path.join(dir, "logs", "app.log"), appLogLines.join("\n") + "\n");

  // logs/error.log — 10 lines
  const errorLines = [
    "2026-03-29T09:12:44.001Z [ERROR] db.pool: Connection refused: ECONNREFUSED 127.0.0.1:5432",
    "2026-03-29T09:12:44.002Z [ERROR] db.pool: Retry attempt 1/3 for connection acquisition",
    "2026-03-29T09:12:45.150Z [ERROR] db.pool: Retry attempt 2/3 for connection acquisition",
    "2026-03-29T09:12:46.301Z [ERROR] db.pool: Retry attempt 3/3 for connection acquisition",
    "2026-03-29T09:12:46.302Z [ERROR] db.pool: All retries exhausted. Entering degraded mode.",
    "2026-03-29T09:13:00.000Z [ERROR] api.handler: 503 Service Unavailable returned for GET /api/v1/evidence/42",
    "2026-03-29T09:14:12.500Z [ERROR] auth.session: Token verification failed: TokenExpiredError at verify (jwt.js:120)",
    "2026-03-29T09:15:33.110Z [ERROR] worker.queue: Job job_id=8821 failed: TimeoutError after 30000ms",
    "2026-03-29T09:16:01.200Z [ERROR] middleware.cors: Blocked request from disallowed origin http://localhost:9999",
    "2026-03-29T09:20:00.000Z [ERROR] app.server: Unhandled rejection: TypeError: Cannot read properties of undefined (reading 'id')",
  ];
  writeText(path.join(dir, "logs", "error.log"), errorLines.join("\n") + "\n");

  // screenshots
  writeBinary(path.join(dir, "screenshots", "step-1.png"), MINIMAL_PNG);
  writeBinary(path.join(dir, "screenshots", "step-2.jpg"), MINIMAL_JPEG);

  // scripts/setup.sh
  writeText(
    path.join(dir, "scripts", "setup.sh"),
    `#!/usr/bin/env bash
set -euo pipefail

echo "=== Evidence Browser Test Setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed."; exit 1; }

# Environment variables
export NODE_ENV="test"
export DATABASE_URL="postgresql://test:test@localhost:5432/evidence_test"
export REDIS_URL="redis://localhost:6379/1"

# Start services
echo "Starting PostgreSQL container..."
docker compose -f docker-compose.test.yml up -d postgres redis

echo "Waiting for database readiness..."
until pg_isready -h localhost -p 5432 -U test 2>/dev/null; do
  sleep 1
done

# Run migrations
echo "Applying database migrations..."
npx prisma migrate deploy

# Seed test data
echo "Seeding test fixtures..."
npx tsx scripts/seed-test-data.ts

echo "=== Setup complete ==="
`,
  );

  // scripts/test.py
  writeText(
    path.join(dir, "scripts", "test.py"),
    `#!/usr/bin/env python3
"""
Evidence Browser integration test suite.
Validates core API endpoints and evidence bundle processing.
"""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

BASE_URL = "http://localhost:3000/api/v1"
TEST_BUNDLE_PATH = Path(__file__).parent.parent / "fixtures" / "fixture-basic"


class TestEvidenceAPI(unittest.TestCase):
    """Integration tests for the Evidence API."""

    def setUp(self):
        self.session = requests.Session()
        self.session.headers.update({"Authorization": "Bearer test-token-abc123"})

    def tearDown(self):
        self.session.close()

    def test_health_check(self):
        resp = self.session.get(f"{BASE_URL}/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")

    def test_upload_bundle(self):
        bundle_zip = TEST_BUNDLE_PATH / "bundle.zip"
        if not bundle_zip.exists():
            self.skipTest("Test bundle not built yet")
        with open(bundle_zip, "rb") as f:
            resp = self.session.post(f"{BASE_URL}/bundles", files={"file": f})
        self.assertEqual(resp.status_code, 201)
        self.assertIn("id", resp.json())

    def test_list_bundles(self):
        resp = self.session.get(f"{BASE_URL}/bundles")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)

    def test_get_bundle_manifest(self):
        resp = self.session.get(f"{BASE_URL}/bundles/1/manifest")
        if resp.status_code == 404:
            self.skipTest("No bundle uploaded yet")
        self.assertEqual(resp.status_code, 200)
        manifest = resp.json()
        self.assertIn("version", manifest)
        self.assertIn("title", manifest)


if __name__ == "__main__":
    unittest.main(verbosity=2)
`,
  );

  // results/output.json
  writeText(
    path.join(dir, "results", "output.json"),
    JSON.stringify(
      {
        testRun: {
          id: "run-20260329-001",
          timestamp: "2026-03-29T10:00:00Z",
          duration: 12450,
          environment: {
            node: "22.21.1",
            os: "linux",
            ci: true,
          },
        },
        summary: {
          total: 24,
          passed: 22,
          failed: 1,
          skipped: 1,
        },
        tests: [
          {
            name: "test_health_check",
            status: "passed",
            duration: 45,
          },
          {
            name: "test_upload_bundle",
            status: "passed",
            duration: 1230,
          },
          {
            name: "test_list_bundles",
            status: "passed",
            duration: 89,
          },
          {
            name: "test_get_bundle_manifest",
            status: "failed",
            duration: 102,
            error: "AssertionError: Expected 200 but got 404",
          },
          {
            name: "test_delete_bundle",
            status: "skipped",
            reason: "Destructive test disabled in CI",
          },
        ],
      },
      null,
      2,
    ),
  );

  // notes.md
  writeText(
    path.join(dir, "notes.md"),
    `# 테스트 상세 노트

[메인 인덱스로 돌아가기](index.md)

## 관찰 사항

1. 데이터베이스 연결 풀이 초기화 시 약 2초 소요됨
2. Redis 캐시 적중률이 87%로 양호한 수준
3. API 응답 시간 중간값: 45ms

## 실패 분석

\`test_get_bundle_manifest\` 테스트가 실패한 원인:
- 번들 업로드 후 매니페스트 인덱싱이 비동기로 처리됨
- 테스트에서 충분한 대기 시간을 두지 않음

## 다음 단계

- [ ] 비동기 인덱싱 완료를 위한 폴링 로직 추가
- [ ] 타임아웃 설정을 환경 변수로 분리
- [x] 에러 로그 형식 표준화 완료
`,
  );

  console.log("  [OK] fixture-basic");
}

// ---------------------------------------------------------------------------
// 2. fixture-deep
// ---------------------------------------------------------------------------
function createFixtureDeep() {
  const dir = fixtureDir("fixture-deep");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "Deep Nesting Test", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(
    path.join(dir, "index.md"),
    "# Deep Nesting Test\n\n[deep file](a/b/c/d/e/deep-file.txt)\n",
  );

  writeText(
    path.join(dir, "a", "b", "c", "d", "e", "deep-file.txt"),
    "This is a deeply nested file.\n",
  );

  console.log("  [OK] fixture-deep");
}

// ---------------------------------------------------------------------------
// 3. fixture-large-tree
// ---------------------------------------------------------------------------
function createFixtureLargeTree() {
  const dir = fixtureDir("fixture-large-tree");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "Large Tree Test", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(
    path.join(dir, "index.md"),
    "# Large Tree Test\n\nThis bundle contains ~120 files.\n",
  );

  for (let d = 1; d <= 10; d++) {
    const dirName = `dir-${String(d).padStart(2, "0")}`;
    for (let f = 1; f <= 10; f++) {
      const fileName = `file-${String(f).padStart(3, "0")}.txt`;
      writeText(
        path.join(dir, dirName, fileName),
        `Content of ${dirName}/${fileName}\nGenerated for large-tree fixture testing.\nLine 3 of sample content.\n`,
      );
    }
    writeText(
      path.join(dir, dirName, "sub", "nested.log"),
      `[INFO] Nested log for ${dirName}/sub/nested.log\n[INFO] Timestamp: 2026-03-29T12:00:00Z\n[DEBUG] Depth test entry\n`,
    );
  }

  console.log("  [OK] fixture-large-tree");
}

// ---------------------------------------------------------------------------
// 4. fixture-markdown-rich
// ---------------------------------------------------------------------------
function createFixtureMarkdownRich() {
  const dir = fixtureDir("fixture-markdown-rich");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "Markdown Rich Test", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(
    path.join(dir, "index.md"),
    `# Markdown Rich Test

## 요약

이 문서는 모든 GFM(GitHub Flavored Markdown) 요소를 포함합니다.

[요약으로](#요약)

### 세 번째 수준 헤더

#### 네 번째 수준 헤더

##### 다섯 번째 수준 헤더

###### 여섯 번째 수준 헤더

일반 단락 텍스트입니다. 여러 문장을 포함합니다. **굵은 텍스트**와 *기울임꼴 텍스트*도 사용합니다.

## 목록

### 순서 없는 목록

- 항목 1
- 항목 2
  - 중첩 항목 2-1
  - 중첩 항목 2-2
- 항목 3

### 순서 있는 목록

1. 첫 번째
2. 두 번째
   1. 중첩 2-1
   2. 중첩 2-2
3. 세 번째

## 인용문

> 이것은 인용문 블록입니다.
>
> 여러 단락을 포함할 수 있습니다.
>
> > 중첩 인용문도 지원됩니다.

## 코드

### 인라인 코드

\`console.log("hello")\` 와 같은 인라인 코드입니다.

### 펜스드 코드 블록

\`\`\`typescript
interface Evidence {
  id: string;
  title: string;
  files: FileEntry[];
  createdAt: Date;
}

function processEvidence(evidence: Evidence): void {
  console.log(\`Processing: \${evidence.title}\`);
  for (const file of evidence.files) {
    console.log(\`  - \${file.path}\`);
  }
}
\`\`\`

\`\`\`python
def analyze_results(data: dict) -> bool:
    """Analyze test results and return pass/fail."""
    total = data.get("total", 0)
    passed = data.get("passed", 0)
    return passed / total >= 0.95 if total > 0 else False
\`\`\`

\`\`\`bash
#!/bin/bash
echo "Running evidence collection..."
tar czf evidence.tar.gz --exclude=node_modules .
\`\`\`

## 테이블

| 컬럼 A | 컬럼 B | 컬럼 C |
|--------|--------|--------|
| 값 1   | 값 2   | 값 3   |
| 값 4   | 값 5   | 값 6   |
| 값 7   | 값 8   | 값 9   |

### 정렬된 테이블

| 왼쪽 정렬 | 가운데 정렬 | 오른쪽 정렬 |
|:-----------|:-----------:|------------:|
| Left       |   Center    |       Right |
| AAA        |    BBB      |         CCC |

## 링크

### 내부 링크

- [서브 문서](docs/sub-doc.md)
- [다이어그램 이미지](images/diagram.png)
- [TypeScript 예제](code/example.ts)

### 외부 링크

- [GitHub](https://github.com)
- [MDN Web Docs](https://developer.mozilla.org)

### 앵커 링크

- [요약으로](#요약)
- [코드 섹션으로](#코드)

## 이미지

![다이어그램](images/diagram.png)

![사진](images/photo.jpg)

![아이콘](images/icon.svg)

![애니메이션](images/animated.gif)

---

## 작업 목록

- [x] 마크다운 파서 구현
- [x] GFM 확장 지원
- [ ] 수학 수식 지원
- [ ] Mermaid 다이어그램 지원

## 취소선

~~이 텍스트는 취소되었습니다.~~

---

*문서 끝*
`,
  );

  // docs/sub-doc.md
  writeText(
    path.join(dir, "docs", "sub-doc.md"),
    `# 서브 문서

[메인으로](../index.md)

## 다이어그램

아래는 시스템 다이어그램입니다:

![다이어그램](../images/diagram.png)

## 참고 사항

이 문서는 상위 디렉토리의 인덱스에서 참조됩니다.
상대 경로를 사용하여 파일 간 링크를 테스트합니다.

- [아이콘 보기](../images/icon.svg)
- [코드 예제](../code/example.ts)
`,
  );

  // images
  writeBinary(path.join(dir, "images", "diagram.png"), MINIMAL_PNG);
  writeBinary(path.join(dir, "images", "photo.jpg"), MINIMAL_JPEG);
  writeText(path.join(dir, "images", "icon.svg"), SIMPLE_SVG);
  writeBinary(path.join(dir, "images", "animated.gif"), MINIMAL_GIF);

  // code/example.ts
  writeText(
    path.join(dir, "code", "example.ts"),
    `/**
 * Evidence Bundle processor example.
 * Demonstrates TypeScript patterns used in the project.
 */

interface BundleManifest {
  version: number;
  title: string;
  index: string;
}

interface FileEntry {
  path: string;
  size: number;
  mimeType: string;
}

async function loadManifest(bundlePath: string): Promise<BundleManifest> {
  const raw = await Bun.file(\`\${bundlePath}/manifest.json\`).text();
  return JSON.parse(raw) as BundleManifest;
}

export async function listFiles(bundlePath: string): Promise<FileEntry[]> {
  const manifest = await loadManifest(bundlePath);
  console.log(\`Bundle: \${manifest.title} (v\${manifest.version})\`);
  // In a real implementation this would walk the bundle directory
  return [];
}
`,
  );

  console.log("  [OK] fixture-markdown-rich");
}

// ---------------------------------------------------------------------------
// 5. fixture-invalid-manifest
// ---------------------------------------------------------------------------
function createFixtureInvalidManifest() {
  const dir = fixtureDir("fixture-invalid-manifest");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify({ version: 1 }, null, 2),
  );

  writeText(path.join(dir, "index.md"), "# Invalid Manifest Test\n");

  console.log("  [OK] fixture-invalid-manifest");
}

// ---------------------------------------------------------------------------
// 6. fixture-no-manifest
// ---------------------------------------------------------------------------
function createFixtureNoManifest() {
  const dir = fixtureDir("fixture-no-manifest");

  writeText(path.join(dir, "index.md"), "# No Manifest Test\n");

  console.log("  [OK] fixture-no-manifest");
}

// ---------------------------------------------------------------------------
// 7. fixture-no-index
// ---------------------------------------------------------------------------
function createFixtureNoIndex() {
  const dir = fixtureDir("fixture-no-index");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "No Index", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(path.join(dir, "logs", "app.log"), "Application started\n");

  console.log("  [OK] fixture-no-index");
}

// ---------------------------------------------------------------------------
// 8. fixture-binary
// ---------------------------------------------------------------------------
function createFixtureBinary() {
  const dir = fixtureDir("fixture-binary");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "Binary Test", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(
    path.join(dir, "index.md"),
    "# Binary Test\n\n- [Data](data.bin)\n- [Archive](archive.tar.gz)\n- [PDF](document.pdf)\n",
  );

  writeBinary(path.join(dir, "data.bin"), crypto.randomBytes(256));
  writeBinary(path.join(dir, "archive.tar.gz"), MINIMAL_GZIP);
  writeBinary(path.join(dir, "document.pdf"), MINIMAL_PDF);

  console.log("  [OK] fixture-binary");
}

// ---------------------------------------------------------------------------
// 9. fixture-security
// ---------------------------------------------------------------------------
function createFixtureSecurity() {
  const dir = fixtureDir("fixture-security");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "Security Test", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(
    path.join(dir, "index.md"),
    `# Security Test

<script>alert('xss')</script>

<iframe src="https://evil.example.com"></iframe>

<img src="x" onerror="alert('xss')">

[정상 링크](normal-file.txt)

[Path traversal 시도](../../../etc/passwd)
`,
  );

  writeText(path.join(dir, "normal-file.txt"), "This is a normal file.\n");

  writeText(path.join(dir, "logs", "safe.log"), "Safe log entry\n");

  console.log("  [OK] fixture-security");
}

// ---------------------------------------------------------------------------
// 10. fixture-unicode
// ---------------------------------------------------------------------------
function createFixtureUnicode() {
  const dir = fixtureDir("fixture-unicode");

  writeText(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, title: "Unicode Test", index: "index.md" },
      null,
      2,
    ),
  );

  writeText(
    path.join(dir, "index.md"),
    '# Unicode Test\n\n- [한글파일](한글파일.txt)\n- [Donn\u00e9es](donn\u00e9es/r\u00e9sultat.json)\n- [日本語](日本語/テスト.log)\n',
  );

  writeText(
    path.join(dir, "한글파일.txt"),
    "한글 내용 테스트입니다.\n",
  );

  writeText(
    path.join(dir, "donn\u00e9es", "r\u00e9sultat.json"),
    JSON.stringify(
      { "r\u00e9sultat": "succ\u00e8s", "donn\u00e9es": [1, 2, 3] },
      null,
      2,
    ) + "\n",
  );

  writeText(
    path.join(dir, "日本語", "テスト.log"),
    "テストログ: 成功\n",
  );

  console.log("  [OK] fixture-unicode");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log(`Creating fixtures in ${FIXTURES_ROOT} ...\n`);

  createFixtureBasic();
  createFixtureDeep();
  createFixtureLargeTree();
  createFixtureMarkdownRich();
  createFixtureInvalidManifest();
  createFixtureNoManifest();
  createFixtureNoIndex();
  createFixtureBinary();
  createFixtureSecurity();
  createFixtureUnicode();

  // Count total files created
  let fileCount = 0;
  function countFiles(dirPath: string) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        countFiles(full);
      } else {
        fileCount++;
      }
    }
  }
  countFiles(FIXTURES_ROOT);

  console.log(`\nDone! Created ${fileCount} files across 10 fixture directories.`);
}

main();
