# Evidence Browser — 현재 구현 아키텍처

> 최종 업데이트: 2026-04-10
> 이 문서는 실제 구현 상태를 반영합니다. 초기 설계 문서(PRD)와 다른 부분이 있습니다.

---

## 1. 전체 구조

```
브라우저
  │
  ▼
proxy.ts (Next.js 16 Proxy)
  │  setup 미완료 → /setup 리다이렉트
  │  미인증       → /login 리다이렉트
  │  MCP 경로     → API 키 검사
  │
  ▼
Next.js App Router
  ├── 페이지 (Server Components)
  │     └── lib/db/* — SQLite 직접 쿼리
  ├── API Routes
  │     ├── lib/auth — HMAC 세션 검증
  │     ├── lib/db/* — SQLite
  │     └── lib/storage/* — 스토리지 어댑터
  └── lib/bundle/extractor — ZIP 해제 + in-process 캐시
        └── /tmp/evidence-bundles/<cacheKey>/
```

---

## 2. 디렉터리 구조

```
src/
├── app/
│   ├── layout.tsx                     # Root layout (Pretendard, dark class 고정)
│   ├── page.tsx                       # 홈 → 워크스페이스 목록
│   ├── login/page.tsx
│   ├── setup/
│   │   ├── layout.tsx
│   │   └── page.tsx                   # 초기 설정 위저드
│   ├── admin/
│   │   ├── layout.tsx
│   │   └── page.tsx                   # 사용자/워크스페이스 관리
│   ├── w/[ws]/
│   │   ├── page.tsx                   # 워크스페이스 번들 목록
│   │   └── b/[...segments]/
│   │       ├── layout.tsx             # 파일 트리 사이드바 + 콘텐츠 영역
│   │       ├── page.tsx               # 번들 뷰어 (랜딩 or 파일)
│   │       ├── error.tsx
│   │       └── not-found.tsx
│   ├── b/[...segments]/page.tsx       # 레거시 경로 (워크스페이스 없는 구버전)
│   ├── api/
│   │   ├── auth/login|logout|me/      # 세션 인증
│   │   ├── admin/users/[id]/          # 사용자 관리 (admin)
│   │   ├── w/[ws]/bundle/             # 번들 목록/업로드
│   │   ├── w/[ws]/bundle/[id]/
│   │   │   ├── meta/                  # manifest + 파일 트리
│   │   │   ├── tree/                  # 파일 트리만
│   │   │   └── file/                  # 파일 콘텐츠 (raw)
│   │   ├── setup/admin|workspace|verify-storage/
│   │   ├── w/route.ts                 # 워크스페이스 목록 API
│   │   ├── mcp/                       # MCP Streamable HTTP
│   │   └── health/
│   └── llm.txt/route.ts               # LLM 통합 가이드 텍스트
├── proxy.ts                           # Next.js 16 Proxy (구 middleware.ts)
├── components/
│   ├── ui/                            # shadcn/ui 컴포넌트
│   ├── layout/                        # AppShell, Header, Brand
│   ├── file-tree/                     # FileTree, TreeNode, TreeContext
│   ├── viewers/                       # FileViewer, Markdown, Code, Image, Text, Download
│   ├── bundle/                        # BundleCard, UploadForm
│   ├── workspace/                     # WorkspaceCard
│   ├── admin/                         # UserList, WorkspaceManager
│   └── setup/                         # SetupWizard
├── lib/
│   ├── auth/                          # HMAC 세션, 쿠키 서명/검증
│   ├── db/                            # SQLite 스키마 + CRUD (users, workspaces, bundles, sessions)
│   ├── storage/                       # StorageAdapter 인터페이스 + Local/S3 구현
│   ├── bundle/                        # ZIP 추출, manifest 파싱, 보안 검증
│   ├── files/                         # 파일 타입 감지, MIME, Shiki 언어 매핑
│   ├── mcp/                           # MCP 서버, LLM 가이드 텍스트 생성
│   └── url.ts                         # URL 파싱/조립 유틸
└── config/
    └── env.ts                         # Zod 환경변수 스키마 (싱글턴)
```

---

## 3. 라우팅

### 페이지 라우트

| 경로 | 설명 | 인증 |
|------|------|------|
| `/` | 워크스페이스 목록 | 필요 |
| `/login` | 로그인 | 불필요 |
| `/setup` | 초기 설정 위저드 | 불필요 (setup 미완료 시만 접근) |
| `/admin` | 어드민 (사용자/워크스페이스) | admin |
| `/w/[ws]` | 워크스페이스 번들 목록 | 필요 |
| `/w/[ws]/b/[...segments]` | 번들 뷰어 | 필요 |

### Bundle ID + 파일 경로 파싱

Bundle ID와 파일 경로 모두 `/`를 포함할 수 있어 단일 catch-all로 처리합니다.
`/f/` 구분자로 bundleId와 filePath를 분리합니다.

```
/w/ci/b/org/repo/pr-42/run-1          → bundleId: org/repo/pr-42/run-1, filePath: null
/w/ci/b/org/repo/pr-42/run-1/f/a.md  → bundleId: org/repo/pr-42/run-1, filePath: a.md
/w/ci/b/org/repo/pr-42/run-1/f/logs/out.log → filePath: logs/out.log
```

> **제약**: bundle ID 세그먼트에 bare `f`가 있으면 오인식. 예: `my-org/f/repo`. v0 문서화된 제약.

### API 라우트

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| `POST` | `/api/auth/login` | 로그인 | 없음 |
| `POST` | `/api/auth/logout` | 로그아웃 | 없음 |
| `GET` | `/api/auth/me` | 세션 정보 | 인증 |
| `GET` | `/api/w` | 워크스페이스 목록 | 인증 |
| `GET` | `/api/w/[ws]/bundle` | 번들 목록 | 인증 |
| `POST` | `/api/w/[ws]/bundle` | 번들 업로드 | admin |
| `GET` | `/api/w/[ws]/bundle/[id]/meta` | manifest + 파일 트리 | 인증 |
| `GET` | `/api/w/[ws]/bundle/[id]/tree` | 파일 트리 | 인증 |
| `GET` | `/api/w/[ws]/bundle/[id]/file` | 파일 콘텐츠 | 인증 |
| `GET` | `/api/admin/users` | 사용자 목록 | admin |
| `POST` | `/api/admin/users` | 사용자 생성 | admin |
| `PATCH` | `/api/admin/users/[id]` | 역할 변경 | admin |
| `DELETE` | `/api/admin/users/[id]` | 사용자 삭제 | admin |
| `POST` | `/api/setup/admin` | 초기 admin 생성 | setup 중 |
| `POST` | `/api/setup/workspace` | 초기 workspace 생성 | setup 중 |
| `POST` | `/api/setup/verify-storage` | 스토리지 연결 확인 | admin |
| `POST` | `/api/mcp` | MCP Streamable HTTP | API 키 (선택) |
| `GET` | `/llm.txt` | LLM 통합 가이드 | API 키 (선택) |
| `GET` | `/api/health` | 헬스체크 | 없음 |

---

## 4. 인증

NextAuth/OIDC를 사용하지 않습니다. 자체 구현입니다.

### 흐름

```
POST /api/auth/login
  │  username + password
  │
  ├─ findUserByUsername (SQLite)
  ├─ verifyPassword (argon2)
  ├─ createSession (SQLite) → session.id
  ├─ signSessionId (HMAC-SHA256)
  └─ Set-Cookie: evidence_session=<sessionId.signature>; HttpOnly; SameSite=Lax
```

### 세션 쿠키 형식

```
evidence_session=<sessionId>.<HMAC-SHA256 signature>
```

- `AUTH_SECRET` 환경변수로 서명
- 만료: 7일
- Proxy에서 DB 조회 없이 HMAC만 검증 (빠른 경로)
- API/페이지에서 전체 검증 (DB 세션 + 사용자 조회)

### Proxy에서의 인증 처리

```
proxy.ts
  ├─ 정적 자산 → pass-through
  ├─ setup 미완료 (admin 없음 || workspace 없음) → /setup 강제 리다이렉트
  ├─ /setup, /login, /api/health → pass-through
  ├─ /api/mcp, /llm.txt → MCP_API_KEY 검사 (설정된 경우)
  └─ 나머지 → 세션 쿠키 HMAC 검증
       └─ 실패 → API: 401 | 페이지: /login?callbackUrl=...
```

---

## 5. 데이터베이스

SQLite (`better-sqlite3`). 파일 경로: `$DATA_DIR/evidence.db` (기본: `./data/evidence.db`).

### 스키마

```sql
users       (id, username, password[argon2], role[admin|user], created_at, updated_at)
workspaces  (id, slug UNIQUE, name, description, created_by, created_at, updated_at)
bundles     (id, bundle_id, workspace_id, title, storage_key UNIQUE, size_bytes, uploaded_by, created_at)
sessions    (id, user_id, expires_at, created_at)
```

### 특징

- WAL 모드 활성화 (`PRAGMA journal_mode = WAL`)
- 외래 키 활성화 (`PRAGMA foreign_keys = ON`)
- 스키마는 `lib/db/index.ts`에 인라인 (파일 읽기 이슈 방지)
- 싱글턴 연결 (`getDb()`)

---

## 6. 스토리지 어댑터

```typescript
interface StorageAdapter {
  getBundleInfo(storageKey: string): Promise<BundleInfo>;
  getBundleStream(storageKey: string): Promise<ReadableStream<Uint8Array>>;
  listBundles?(prefix?: string): Promise<string[]>;
  putBundle?(storageKey: string, data: Buffer): Promise<void>;
}
```

### 스토리지 키 형식

```
{workspace-slug}/{bundleId}
→ 파일: {workspace-slug}/{bundleId}.zip
```

### 구현체

| 어댑터 | 환경변수 | 비고 |
|--------|----------|------|
| `LocalFSAdapter` | `STORAGE_LOCAL_PATH` (기본: `./data/bundles`) | path traversal 방어 포함 |
| `S3Adapter` | `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` 등 | Cloudflare R2 호환 |

선택: `STORAGE_TYPE=local|s3` (기본: `local`)

---

## 7. 번들 처리 파이프라인

### 업로드 흐름

```
POST /api/w/[ws]/bundle (multipart/form-data)
  │
  ├─ .zip 확장자 확인
  ├─ 파일 크기 확인 (MAX_BUNDLE_SIZE, 기본 500MB)
  ├─ bundleId 유효성 확인 (.., /, \0 차단)
  ├─ tmpDir에 임시 저장
  ├─ validateBundleZip(tmpZip)       ← 스토리지 저장 전 검증
  │     ├─ manifest.json 존재 확인
  │     ├─ JSON 파싱
  │     ├─ version/title/index 필드 확인
  │     └─ index 파일 존재 확인
  │  실패 → 400 (에러 메시지 반환)
  ├─ storage.putBundle(key, buffer)
  └─ DB createBundle (title 포함)
```

### 조회/뷰어 흐름

```
GET /w/[ws]/b/[...segments]
  │  (Server Component)
  │
  ├─ URL 파싱 → bundleId, filePath
  ├─ extractBundle(storageKey)
  │     ├─ 캐시 확인 (in-process Map, key = sha256(bundleId+etag))
  │     ├─ hit → lastAccessed 갱신 후 반환
  │     └─ miss
  │           ├─ storage.getBundleStream()
  │           ├─ yauzl-promise로 /tmp/evidence-bundles/<key>/ 에 해제
  │           │     ├─ validatePathSafety() — 논리 경로 검증
  │           │     ├─ ensureWithinRoot()   — 물리 경로 검증
  │           │     ├─ MAX_FILE_COUNT 확인
  │           │     └─ MAX_SINGLE_FILE_SIZE 초과 파일 스킵
  │           ├─ parseManifest(cacheDir)
  │           └─ buildFileTree(cacheDir)
  │
  ├─ filePath 없음 → manifest.index 파일 읽어 MarkdownViewer
  └─ filePath 있음 → detectFileType() → FileViewer 분기
```

### 캐시

- in-process `Map<cacheKey, CacheEntry>` (서버 재시작 시 소멸)
- TTL: `CACHE_TTL_MS` (기본 30분)
- 최대 항목: `CACHE_MAX_ENTRIES` (기본 50)
- 만료 항목: lazy eviction (다음 요청 시 정리)

---

## 8. 파일 뷰어

```
FileViewer
  ├─ detectFileType(filePath)
  │     확장자 기반 분기
  │
  ├─ "markdown"  → MarkdownViewer (react-markdown + remark-gfm + rehype-sanitize)
  │                  내부 링크 → /w/[ws]/b/[bundleId]/f/[path]
  │                  내부 이미지 → /api/w/[ws]/bundle/[id]/file?path=
  ├─ "code"      → CodeViewer (Shiki, 언어 자동 감지)
  ├─ "image"     → ImageViewer (API 경로로 src)
  ├─ "text"      → TextViewer (라인 넘버)
  └─ "binary"    → DownloadFallback (/api/.../file 링크)
```

---

## 9. MCP 서버

`/api/mcp` — MCP Streamable HTTP (stateless).

`MCP_API_KEY` 환경변수 설정 시 `Authorization: Bearer <key>` 검사.

### 제공 도구

| 도구 | 설명 |
|------|------|
| `get_bundle_schema` | manifest.json 스키마 + zip 구조 |
| `get_storage_info` | 현재 스토리지 설정 (시크릿 제외) |
| `get_upload_instructions` | 업로드 절차 전문 |
| `list_workspaces` | 워크스페이스 목록 |
| `list_bundles` | 특정 워크스페이스의 번들 목록 |

`/llm.txt` — 동일한 내용을 일반 텍스트로 제공.

---

## 10. 초기 설정 흐름 (Setup)

Proxy에서 `countAdmins() === 0 || listWorkspaces().length === 0` 이면 모든 요청을 `/setup`으로 강제 리다이렉트합니다.

```
SetupWizard (Client Component)
  step 1: 관리자 계정 생성  → POST /api/setup/admin
  step 2: 스토리지 확인     → POST /api/setup/verify-storage
  step 3: 첫 워크스페이스  → POST /api/setup/workspace
  done:   / 로 이동
```

Setup 완료 후 `/setup` 접근 시 `/`로 리다이렉트.

---

## 11. 보안

| 위협 | 대응 |
|------|------|
| Path traversal (`../`) | `validatePathSafety()` 논리 검증 + `ensureWithinRoot()` 물리 검증 이중 체크 |
| Zip bomb | `MAX_BUNDLE_SIZE`, `MAX_FILE_COUNT`, `MAX_SINGLE_FILE_SIZE` |
| XSS (마크다운 raw HTML) | `rehype-sanitize` |
| 세션 위조 | HMAC-SHA256 서명 + 상수시간 비교 |
| 비밀번호 | argon2 해시 (`@node-rs/argon2`) |
| 스토리지 키 path traversal | `storageKey()` 에서 `..`, `/`, `\0` 차단 |
| 업로드 검증 우회 | 스토리지 저장 전 ZIP 직접 검증 (`validateBundleZip`) |
| 미인증 접근 | Proxy 레벨 차단 + API Route 레벨 이중 확인 |

---

## 12. 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATA_DIR` | `./data` | SQLite DB 저장 경로 |
| `AUTH_SECRET` | (dev용 기본값) | HMAC 서명 키. **프로덕션 필수 변경** |
| `STORAGE_TYPE` | `local` | `local` 또는 `s3` |
| `STORAGE_LOCAL_PATH` | `./data/bundles` | local 스토리지 경로 |
| `S3_BUCKET` | — | S3/R2 버킷명 |
| `S3_REGION` | `auto` | S3 리전 |
| `S3_ENDPOINT` | — | R2 등 커스텀 엔드포인트 |
| `S3_ACCESS_KEY_ID` | — | S3 인증 |
| `S3_SECRET_ACCESS_KEY` | — | S3 인증 |
| `S3_FORCE_PATH_STYLE` | `false` | MinIO 등 self-hosted S3 |
| `MCP_API_KEY` | — | MCP/llm.txt 접근 제한 (선택) |
| `CACHE_TTL_MS` | `1800000` | 번들 캐시 TTL (30분) |
| `CACHE_MAX_ENTRIES` | `50` | 최대 캐시 항목 수 |
| `MAX_BUNDLE_SIZE` | `524288000` | 최대 번들 크기 (500MB) |
| `MAX_FILE_COUNT` | `10000` | 번들당 최대 파일 수 |
| `MAX_SINGLE_FILE_SIZE` | `104857600` | 단일 파일 최대 크기 (100MB) |

---

## 13. 주요 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `next` | 16.2.1 | App Router, proxy.ts |
| `react` | 19.2.4 | |
| `better-sqlite3` | ^12 | SQLite (동기 API) |
| `@node-rs/argon2` | ^2 | 비밀번호 해시 |
| `yauzl-promise` | ^4 | ZIP 스트리밍 해제 |
| `@aws-sdk/client-s3` | ^3 | S3/R2 스토리지 |
| `shiki` | ^4 | 서버사이드 코드 하이라이팅 |
| `react-markdown` | ^10 | 마크다운 렌더링 |
| `rehype-sanitize` | ^6 | HTML 새니타이징 |
| `remark-gfm` | ^4 | GFM 확장 |
| `zod` | ^4 | 환경변수 스키마 검증 |
| `@base-ui/react` | ^1 | 헤드리스 UI |
| `tailwindcss` | ^4 | 스타일링 |
| `@modelcontextprotocol/sdk` | — | MCP 서버 |

---

## 14. 현재 구현과 초기 설계의 주요 차이

| 항목 | 초기 설계 | 현재 구현 |
|------|-----------|-----------|
| 인증 | NextAuth v5 + OIDC | 자체 HMAC 세션 + argon2 |
| DB | 없음 (파일시스템만) | SQLite (users, workspaces, bundles, sessions) |
| 라우팅 | `/b/[...segments]` | `/w/[ws]/b/[...segments]` (워크스페이스 추가) |
| proxy | `middleware.ts` | `proxy.ts` (Next.js 16 컨벤션) |
| MCP | 없음 | `/api/mcp` + `/llm.txt` |
| 어드민 | 없음 | `/admin` (사용자/워크스페이스 관리) |
| Setup | 없음 | `/setup` 위저드 (admin + workspace + storage 확인) |
| 업로드 UI | 없음 | `/w/[ws]` 에서 드래그앤드롭 업로드 |
