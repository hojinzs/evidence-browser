# Evidence Browser v0 — 기술 설계 문서

## Context

에이전트가 생성한 evidence bundle(zip)을 인증된 환경에서 안전하게 탐색할 수 있는 경량 viewer를 구축한다.
PRD에서 정의한 요구사항과 기술 결정을 기반으로 한 구현 청사진이다.

---

## 1. 디렉토리 구조

```
evidence-browser/
├── docs/
│   ├── PRD.md
│   └── ARCHITECTURE.md          ← 이 문서
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout (providers, global styles)
│   │   ├── page.tsx             # Landing / redirect
│   │   ├── b/
│   │   │   └── [...segments]/
│   │   │       ├── layout.tsx   # Bundle layout (file tree sidebar + content area)
│   │   │       └── page.tsx     # Bundle landing 또는 file viewer (segments 파싱)
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # NextAuth handler
│   │   │   └── bundle/
│   │   │       ├── [bundleId]/
│   │   │       │   ├── meta/route.ts        # GET manifest + file tree
│   │   │       │   ├── file/route.ts        # GET file content (query: path)
│   │   │       │   └── tree/route.ts        # GET file tree only
│   │   └── login/
│   │       └── page.tsx         # Login page
│   ├── auth.ts                  # NextAuth v5 config
│   ├── middleware.ts            # Auth middleware
│   ├── lib/
│   │   ├── url.ts              # URL segments 파싱 (bundleId/filePath 분리)
│   │   ├── storage/
│   │   │   ├── types.ts        # StorageAdapter interface
│   │   │   ├── index.ts        # Adapter factory
│   │   │   ├── local.ts        # LocalFSAdapter
│   │   │   └── s3.ts           # S3Adapter (R2 호환)
│   │   ├── bundle/
│   │   │   ├── extractor.ts    # Zip 해제 + /tmp 캐시 관리
│   │   │   ├── manifest.ts     # manifest.json 파싱/검증
│   │   │   ├── security.ts     # Path traversal 방지
│   │   │   └── types.ts        # Bundle 관련 타입
│   │   └── files/
│   │       ├── detect.ts       # 파일 타입 감지 (확장자 기반)
│   │       └── types.ts        # FileType enum
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 컴포넌트
│   │   ├── layout/
│   │   │   ├── app-shell.tsx   # 전체 레이아웃 shell
│   │   │   └── header.tsx      # 상단 바 (제목, 인증 상태)
│   │   ├── file-tree/
│   │   │   ├── file-tree.tsx   # 트리 컨테이너
│   │   │   ├── tree-node.tsx   # 트리 노드 (폴더/파일)
│   │   │   └── tree-context.tsx # 트리 상태 관리
│   │   └── viewers/
│   │       ├── file-viewer.tsx      # 타입별 viewer 디스패처
│   │       ├── markdown-viewer.tsx  # Markdown 렌더러
│   │       ├── code-viewer.tsx      # Shiki syntax highlight
│   │       ├── image-viewer.tsx     # 이미지 뷰어
│   │       ├── text-viewer.tsx      # 플레인 텍스트 + 라인넘버
│   │       └── download-fallback.tsx # 미지원 파일
│   └── config/
│       └── env.ts              # 환경변수 스키마 (zod)
├── scripts/
│   └── seed.ts              # 샘플 bundle 생성 스크립트
├── fixtures/
│   └── sample-bundle/       # seed 원본 파일들
│       ├── manifest.json
│       ├── index.md
│       ├── logs/
│       ├── screenshots/
│       └── scripts/
├── public/
├── Dockerfile
├── docker-compose.yml
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## 2. 라우팅 설계

### 핵심 문제

Bundle ID(`org/repo/pr-182/run-1`)와 파일 경로(`logs/output.log`) 모두 슬래시를 포함한다.
이를 하나의 URL에서 구분해야 한다.

### 해법: 단일 catch-all + `/f/` 구분자

`app/b/[...segments]/page.tsx` 하나의 catch-all 라우트를 사용한다.
런타임에 segments 배열에서 첫 번째 `f` 요소를 찾아 분리한다.

```typescript
// src/lib/url.ts

interface ParsedSegments {
  bundleId: string;
  filePath: string | null;
}

export function parseSegments(segments: string[]): ParsedSegments {
  const fIndex = segments.indexOf('f');

  // /f/ 가 없으면 → bundle landing
  if (fIndex === -1) {
    return {
      bundleId: segments.join('/'),
      filePath: null,
    };
  }

  // /f/ 앞 = bundleId, /f/ 뒤 = filePath
  return {
    bundleId: segments.slice(0, fIndex).join('/'),
    filePath: segments.slice(fIndex + 1).join('/'),
  };
}
```

### URL 예시

| URL | bundleId | filePath |
|-----|----------|----------|
| `/b/org/repo/pr-182/run-1` | `org/repo/pr-182/run-1` | `null` (landing) |
| `/b/org/repo/pr-182/run-1/f/index.md` | `org/repo/pr-182/run-1` | `index.md` |
| `/b/org/repo/pr-182/run-1/f/logs/app.log` | `org/repo/pr-182/run-1` | `logs/app.log` |

### API 라우트에서의 Bundle ID

API에서는 bundle ID를 URL-encode하여 단일 세그먼트로 전달한다.

```
GET /api/bundle/org%2Frepo%2Fpr-182%2Frun-1/meta
GET /api/bundle/org%2Frepo%2Fpr-182%2Frun-1/file?path=logs/app.log
GET /api/bundle/org%2Frepo%2Fpr-182%2Frun-1/tree
```

### v0 제약사항

Bundle ID에 bare `f` 세그먼트가 들어가면 파싱이 깨진다.
예: `my-org/f/repo` → `f`를 구분자로 오인식.
v0에서는 이를 문서화된 제약으로 둔다. v1에서 필요시 다른 구분자(`~f/`, `_file/` 등) 또는 bundle ID 인코딩으로 해결.

---

## 3. 스토리지 어댑터

### 인터페이스

```typescript
// src/lib/storage/types.ts

export interface BundleInfo {
  exists: boolean;
  size?: number;        // bytes
  etag?: string;        // 캐시 키 생성용
  lastModified?: Date;
}

export interface StorageAdapter {
  /** bundle zip이 존재하는지 확인 + 메타 정보 */
  getBundleInfo(bundleId: string): Promise<BundleInfo>;

  /** bundle zip의 readable stream 반환 */
  getBundleStream(bundleId: string): Promise<ReadableStream<Uint8Array>>;
}
```

### Factory

```typescript
// src/lib/storage/index.ts

export function createStorageAdapter(): StorageAdapter {
  const type = process.env.STORAGE_TYPE ?? 'local';

  switch (type) {
    case 'local':
      return new LocalFSAdapter(process.env.STORAGE_LOCAL_PATH!);
    case 's3':
      return new S3Adapter({
        bucket: process.env.S3_BUCKET!,
        region: process.env.S3_REGION,
        endpoint: process.env.S3_ENDPOINT, // R2 호환
        credentials: { /* env에서 읽기 */ },
      });
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

// 프로세스 레벨 싱글턴
let _adapter: StorageAdapter | null = null;
export function getStorageAdapter(): StorageAdapter {
  if (!_adapter) _adapter = createStorageAdapter();
  return _adapter;
}
```

### LocalFSAdapter

```typescript
// src/lib/storage/local.ts
// bundleId가 곧 basePath 아래의 디렉토리/파일 경로
// 예: basePath=/data/bundles, bundleId=org/repo/pr-182/run-1
//   → /data/bundles/org/repo/pr-182/run-1.zip
```

### S3Adapter

```typescript
// src/lib/storage/s3.ts
// @aws-sdk/client-s3 사용
// bundleId → S3 key: `${bundleId}.zip` 또는 `${bundleId}/bundle.zip`
// R2: S3_ENDPOINT를 Cloudflare R2 endpoint로 설정하면 호환
```

---

## 4. Zip 처리 파이프라인

### 흐름

```
요청 → 캐시 확인 → (miss) → Storage에서 zip stream → /tmp에 해제 → 파일 서빙
                  → (hit)  → /tmp에서 직접 파일 서빙
```

### 캐시 전략

```typescript
// src/lib/bundle/extractor.ts

interface CacheEntry {
  cacheDir: string;      // /tmp/evidence-bundles/<cacheKey>/
  createdAt: number;
  lastAccessed: number;
  manifest: Manifest;
  fileTree: TreeNode[];
}

// 캐시 키: sha256(bundleId + etag)
// TTL: 기본 30분, 환경변수로 조정 가능
// 정리: 파일 접근 시 만료 항목 lazy eviction
```

### 해제 과정

```typescript
export async function extractBundle(bundleId: string): Promise<CacheEntry> {
  const storage = getStorageAdapter();
  const info = await storage.getBundleInfo(bundleId);

  if (!info.exists) throw new BundleNotFoundError(bundleId);

  const cacheKey = computeCacheKey(bundleId, info.etag);
  const existing = cache.get(cacheKey);
  if (existing && !isExpired(existing)) {
    existing.lastAccessed = Date.now();
    return existing;
  }

  const cacheDir = path.join(CACHE_BASE, cacheKey);
  await fs.mkdir(cacheDir, { recursive: true });

  const stream = await storage.getBundleStream(bundleId);

  // yauzl-promise로 스트리밍 해제
  // 각 entry에 대해:
  //   1. validatePathSafety(entry.filename) — path traversal 체크
  //   2. ensureWithinRoot(cacheDir, targetPath) — resolved path 체크
  //   3. 사이즈 제한 체크
  //   4. 파일 쓰기

  const manifest = await parseManifest(cacheDir);
  const fileTree = await buildFileTree(cacheDir);

  const entry: CacheEntry = {
    cacheDir,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    manifest,
    fileTree,
  };
  cache.set(cacheKey, entry);
  return entry;
}
```

### 보안 검증

```typescript
// src/lib/bundle/security.ts

/** 논리적 경로 검증: .., 절대경로, null byte 차단 */
export function validatePathSafety(filePath: string): boolean {
  if (filePath.includes('..')) return false;
  if (path.isAbsolute(filePath)) return false;
  if (filePath.includes('\0')) return false;
  return true;
}

/** 물리적 경로 검증: resolve 후 root 내부인지 확인 */
export function ensureWithinRoot(root: string, targetPath: string): boolean {
  const resolved = path.resolve(root, targetPath);
  return resolved.startsWith(path.resolve(root) + path.sep);
}
```

### 리소스 제한

```typescript
const LIMITS = {
  MAX_BUNDLE_SIZE: 500 * 1024 * 1024,    // 500MB
  MAX_FILE_COUNT: 10_000,
  MAX_SINGLE_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  CACHE_TTL_MS: 30 * 60 * 1000,           // 30분
  MAX_CACHE_ENTRIES: 50,
};
```

---

## 5. API 라우트

### `GET /api/bundle/[bundleId]/meta`

Bundle의 manifest + 파일 트리를 반환한다.

```typescript
// Response
{
  manifest: { version: 1, title: "PR #182 evidence", index: "index.md" },
  tree: [
    { name: "index.md", type: "file", path: "index.md" },
    { name: "logs", type: "directory", path: "logs", children: [
      { name: "app.log", type: "file", path: "logs/app.log" }
    ]},
  ]
}
```

### `GET /api/bundle/[bundleId]/file?path=<filePath>`

특정 파일의 내용을 반환한다.

- `Content-Type`을 파일 확장자에 맞게 설정
- 이미지: binary response
- 텍스트/코드: `text/plain; charset=utf-8`
- CSP 헤더 적용 (script 실행 방지)

### `GET /api/bundle/[bundleId]/tree`

파일 트리만 반환 (경량 요청용).

---

## 6. 인증

### NextAuth v5 설정

```typescript
// src/auth.ts
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "oidc",
      name: process.env.OIDC_PROVIDER_NAME ?? "OIDC",
      type: "oidc",
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
  ],
  session: { strategy: "jwt" },  // DB 불필요
  pages: { signIn: "/login" },
});
```

### Middleware

```typescript
// src/middleware.ts
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/b/:path*", "/api/bundle/:path*"],
};
```

### Dev Bypass 모드

```typescript
// NODE_ENV=development && AUTH_BYPASS=true 일 때
// middleware에서 auth 체크 스킵, mock user 주입
```

---

## 7. 핵심 컴포넌트

### 레이아웃 구조

```
AppShell
├── Header (제목, 유저 아바타, 로그아웃)
├── Sidebar (FileTree) — 모바일에서는 drawer
└── Main Content Area
    ├── BundleLanding (index.md 렌더링) — filePath가 null일 때
    └── FileViewer (파일 타입별 뷰어) — filePath가 있을 때
```

### FileTree 컴포넌트

```typescript
// src/components/file-tree/file-tree.tsx
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;                  // bundle root 기준 상대 경로
  children?: TreeNode[];
}

// - 폴더 접기/펼치기 (기본: 1레벨 펼침)
// - 현재 파일 하이라이트
// - 클릭 시 Next.js router.push로 네비게이션
// - shadcn/ui의 Collapsible 또는 직접 구현
```

### FileViewer 디스패처

```typescript
// src/components/viewers/file-viewer.tsx
export function FileViewer({ bundleId, filePath, content }: Props) {
  const fileType = detectFileType(filePath);

  switch (fileType) {
    case 'markdown':  return <MarkdownViewer ... />;
    case 'image':     return <ImageViewer ... />;
    case 'code':      return <CodeViewer ... />;
    case 'text':      return <TextViewer ... />;
    default:          return <DownloadFallback ... />;
  }
}
```

---

## 8. Markdown 렌더링

### 라이브러리 구성

```
react-markdown
├── remark-gfm          (GFM: table, task list, strikethrough)
└── rehype-sanitize      (HTML sanitize)
```

### 내부 링크 처리

```typescript
// markdown-viewer.tsx 내부
const components = {
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;

    // 외부 링크
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    }

    // bundle 내부 링크 → viewer 경로로 변환
    const resolvedPath = resolveRelativePath(currentFilePath, href);
    return <Link href={`/b/${bundleId}/f/${resolvedPath}`}>{children}</Link>;
  },

  img: ({ src, alt }) => {
    if (!src) return null;

    // 외부 이미지
    if (src.startsWith('http')) {
      return <img src={src} alt={alt} />;
    }

    // bundle 내부 이미지 → API 경로로 변환
    const resolvedPath = resolveRelativePath(currentFilePath, src);
    return (
      <img
        src={`/api/bundle/${encodeBundleId(bundleId)}/file?path=${resolvedPath}`}
        alt={alt}
      />
    );
  },
};
```

---

## 9. 파일 타입 감지

```typescript
// src/lib/files/detect.ts

export type FileType = 'markdown' | 'image' | 'code' | 'text' | 'binary';

const EXTENSION_MAP: Record<string, FileType> = {
  // Markdown
  '.md': 'markdown', '.mdx': 'markdown',
  // Image
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
  '.gif': 'image', '.svg': 'image', '.webp': 'image',
  // Code
  '.ts': 'code', '.tsx': 'code', '.js': 'code', '.jsx': 'code',
  '.py': 'code', '.rb': 'code', '.go': 'code', '.rs': 'code',
  '.java': 'code', '.kt': 'code', '.swift': 'code',
  '.css': 'code', '.scss': 'code', '.html': 'code',
  '.yaml': 'code', '.yml': 'code', '.toml': 'code',
  '.sh': 'code', '.bash': 'code',
  '.sql': 'code', '.graphql': 'code',
  '.dockerfile': 'code',
  // Text
  '.txt': 'text', '.log': 'text', '.csv': 'text',
  // JSON
  '.json': 'code', '.jsonl': 'code',
};

export function detectFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'binary';
}
```

---

## 10. 보안

| 위협 | 대응 |
|------|------|
| Path traversal (`../../../etc/passwd`) | `validatePathSafety` + `ensureWithinRoot` 이중 검증 |
| XSS via Markdown raw HTML | `rehype-sanitize` 적용, 위험 태그/속성 제거 |
| Script 실행 in file viewer | CSP 헤더: `script-src 'none'` on file responses |
| Bundle 외부 파일 접근 | 모든 파일 경로를 bundle root 기준으로 resolve 후 경계 체크 |
| Zip bomb | MAX_BUNDLE_SIZE, MAX_FILE_COUNT, MAX_SINGLE_FILE_SIZE 제한 |
| 미인증 접근 | NextAuth middleware가 `/b/*`, `/api/bundle/*` 보호 |

---

## 11. 주요 의존성

```json
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "next-auth": "^5",
    "react-markdown": "^9",
    "remark-gfm": "^4",
    "rehype-sanitize": "^6",
    "shiki": "^1",
    "yauzl-promise": "^4",
    "@aws-sdk/client-s3": "^3",
    "zod": "^3",
    "tailwindcss": "^4",
    "@radix-ui/react-collapsible": "latest",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  }
}
```

---

## 12. 배포

### Vercel

- `next.config.ts`에서 serverless function 설정
- /tmp 사용 가능 (함수 실행 간 공유 불보장, cold start 시 초기화)
- 환경변수는 Vercel dashboard에서 설정

### Docker (self-host)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

`next.config.ts`에 `output: "standalone"` 설정.

---

## 13. 환경변수

```bash
# .env.example

# Auth
OIDC_ISSUER=https://auth.example.com/application/o/evidence-browser/
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_PROVIDER_NAME=Authentik
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=           # openssl rand -base64 32

# Storage
STORAGE_TYPE=local         # local | s3
STORAGE_LOCAL_PATH=./data/bundles

# S3/R2 (STORAGE_TYPE=s3 일 때)
S3_BUCKET=
S3_REGION=auto
S3_ENDPOINT=               # R2: https://<account>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Cache
CACHE_TTL_MS=1800000       # 30분
CACHE_MAX_ENTRIES=50

# Limits
MAX_BUNDLE_SIZE=524288000  # 500MB
MAX_FILE_COUNT=10000

# Dev
AUTH_BYPASS=false           # true only with NODE_ENV=development
```

---

## 14. 셋업 경험

### 개발 환경 (Quick Start)

```bash
git clone <repo> && cd evidence-browser
npm install
cp .env.example .env.local
# .env.local: AUTH_BYPASS=true, STORAGE_TYPE=local 이미 기본값

npm run seed        # 샘플 bundle → ./data/bundles/sample/test-run.zip
npm run dev         # http://localhost:3000/b/sample/test-run
```

`npm run seed`는 `scripts/seed.ts`를 실행한다.
`fixtures/sample-bundle/`의 파일들을 zip으로 묶어 `STORAGE_LOCAL_PATH`에 배치한다.

### 프로덕션 (Docker)

```bash
cp .env.example .env
# .env 편집: OIDC_*, STORAGE_*, NEXTAUTH_* 설정

docker compose up -d
# https://evidence.example.com 접속 → OIDC 로그인
```

### 프로덕션 (Vercel)

```bash
vercel deploy
# Vercel Dashboard → Environment Variables 설정
# Authentik에 Redirect URI 등록: https://<project>.vercel.app/api/auth/callback/oidc
```

### OIDC 설정 가이드

별도 문서: `docs/setup-oidc.md`
- Generic OIDC provider 설정 방법 (issuer, client ID/secret, redirect URI)
- Authentik 예시 (간략)
- Keycloak 예시 (간략)
- 트러블슈팅: redirect URI 불일치, discovery endpoint 확인 등

---

## 15. 구현 순서

1. 프로젝트 초기화 (Next.js + Tailwind + shadcn/ui)
2. 환경변수 스키마 (`src/config/env.ts`)
3. 샘플 bundle fixtures + seed 스크립트
4. 스토리지 어댑터 (LocalFS 먼저)
5. Zip 해제 + 캐시 파이프라인
6. manifest 파싱 + 보안 검증
7. API 라우트 (`/api/bundle/[bundleId]/*`)
8. URL 파싱 (`src/lib/url.ts`)
9. 인증 (NextAuth + OIDC + dev bypass)
10. 파일 트리 컴포넌트
11. 파일 뷰어 (Markdown → Code → Image → Text → Fallback)
12. Bundle Landing 페이지 조립
13. 모바일 반응형
14. Docker 설정
15. OIDC 설정 가이드 (`docs/setup-oidc.md`)

---

## 16. 검증 방법

1. **샘플 bundle 생성**: manifest.json + index.md + 로그/이미지/코드 파일을 zip으로 묶어 `./data/bundles/test/sample.zip`에 배치
2. **로컬 실행**: `AUTH_BYPASS=true npm run dev`
3. **인증 테스트**: Authentik dev 인스턴스 연결 후 로그인 플로우 확인
4. **핵심 시나리오 검증**:
   - `/b/test/sample` 접속 → index.md 렌더링 확인
   - 파일 트리에서 파일 클릭 → 해당 파일 열림
   - index.md 내 상대 링크 클릭 → 해당 파일로 이동
   - 이미지 인라인 렌더링 확인
   - 코드 파일 syntax highlight 확인
5. **보안 테스트**: `../../../etc/passwd` 경로 시도 → 차단 확인
6. **Docker 빌드**: `docker build -t evidence-browser . && docker run -p 3000:3000 evidence-browser`
