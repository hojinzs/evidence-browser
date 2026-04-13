# Plan: Monorepo 전환 + React/Hono 마이그레이션 + `eb` CLI

## Context

Evidence Browser를 npm workspaces 모노레포로 전환하고, Next.js를 제거해
Hono(백엔드) + Vite/TanStack(프론트엔드) 구조로 재설계한다.
CLI(`eb`)를 신규 패키지로 추가하고, Changesets + GitHub Actions으로 배포 파이프라인을 구성한다.

**핵심 결정:**
- bundleId는 flat slug만 허용 (`pr-42-run-1`)
- CLI 인증: API 키 전용 (Bearer 토큰)
- Backend: **Hono** + `@hono/node-server`
- Frontend: **Vite + TanStack Router v1 + TanStack Query v5**
- 마이그레이션 전략: `packages/legacy`를 extraction base로 사용하되, 최종 전환은 `packages/api`/`packages/web`로 한 번에 cutover

---

## Bundle ID + URL 규칙

### bundleId 규칙

- bundleId는 단일 path segment로만 사용한다. `/`를 포함하지 않는다.
- 목적은 사람이 읽을 수 있는 안정적인 식별자이며, 계층 구조는 bundleId 내부가 아니라 metadata로 표현한다.
- 권장 형식: lowercase flat slug
- 권장 정규식: `^[a-z0-9][a-z0-9._-]{0,127}$`
- 금지:
  - `/`, `\\`
  - 공백
  - `..`
  - `\0`
  - 퍼센트 인코딩 입력값 (`%2f`, `%2F`)
  - 대문자

**예시**
- 허용: `pr-42-run-1`
- 허용: `org-repo-pr-42-run-1`
- 허용: `20260412-pr-42-attempt1`
- 거부: `pr-42/run-1`
- 거부: `../run-1`
- 거부: `PR-42`

### URL 규칙

- bundleId는 URL path의 단일 세그먼트로 사용한다.
- bundle 내부 파일 경로는 catch-all path가 아니라 query string `path`로 전달한다.
- 권장 라우트:
  - Viewer landing: `/w/:ws/b/:bundleId`
  - Viewer file: `/w/:ws/b/:bundleId/f?path=logs/app.log`
  - API meta: `/api/w/:ws/bundles/:bundleId/meta`
  - API tree: `/api/w/:ws/bundles/:bundleId/tree`
  - API file: `/api/w/:ws/bundles/:bundleId/file?path=logs/app.log`

### Storage 규칙

- storage key는 기존처럼 `{workspace}/{bundleId}`를 사용한다.
- 실제 object/file 이름은 `{workspace}/{bundleId}.zip`

---

## 목표 패키지 구조

```
evidence-browser/
├── package.json                    # workspaces: ["packages/*"]
├── .changeset/config.json
├── packages/
│   ├── legacy/                     # 현재 Next.js 앱 (임시 extraction source)
│   ├── shared/                     # @evidence-browser/shared (CJS)
│   ├── api/                        # @evidence-browser/api (Hono + Node.js)
│   ├── web/                        # @evidence-browser/web (Vite + TanStack)
│   └── cli/                        # @evidence-browser/cli (`eb`)
```

---

## Phase 0: packages/legacy 이동 (구조 전환 시작점)

**목적:** 기존 코드를 건드리지 않고 workspace 구조를 먼저 만들어 CI를 통과시킨다.

### 0.1 작업 순서

1. `packages/legacy/` 디렉터리 생성
2. 현재 루트의 Next.js 관련 파일 이동:
   - `src/`, `public/`, `tests/`, `fixtures/`, `scripts/`, `hooks/`
   - `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`
   - `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `next-env.d.ts`
3. `packages/legacy/package.json` 생성 (기존 `package.json` 기반, `name: "@evidence-browser/legacy"`)
4. 루트 `package.json` → workspaces 형태로 교체

### 0.2 루트 `package.json`

```json
{
  "name": "evidence-browser-root",
  "version": "0.0.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "npm -w @evidence-browser/legacy run dev",
    "build": "npm -w @evidence-browser/legacy run build",
    "test": "npm -w @evidence-browser/legacy run test",
    "test:visual": "npm -w @evidence-browser/legacy run test:visual",
    "changeset": "changeset",
    "changeset:version": "changeset version",
    "changeset:publish": "changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.7"
  }
}
```

### 0.3 Dockerfile (Phase 0 — legacy 기반 임시)

```dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package*.json ./
COPY packages/legacy/package.json ./packages/legacy/
RUN npm ci --include=dev
RUN npm rebuild better-sqlite3 --build-from-source

COPY packages/legacy ./packages/legacy
RUN npm -w @evidence-browser/legacy run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/legacy/.next/standalone ./
COPY --from=builder /app/packages/legacy/.next/static ./.next/static
COPY --from=builder /app/packages/legacy/public ./public
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/@node-rs ./node_modules/@node-rs

RUN mkdir -p /data/bundles && chown -R nextjs:nodejs /data
VOLUME /data
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0" DATA_DIR=/data STORAGE_LOCAL_PATH=/data/bundles
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
```

> **Phase 0 완료 검증:** `npm -w @evidence-browser/legacy run dev` 실행, 기존 기능 정상

---

## Phase 1: bundleId flat slug 규칙 확정

기존 legacy 코드 내에서 수정 (Phase 0 이후).

### 변경 파일

**`packages/legacy/src/lib/bundle/upload-validation.ts`**

`validateBundleId()`를 flat slug 규칙으로 강화:
```typescript
// 변경 전
bundleId.includes("..") || bundleId.includes("/") || bundleId.includes("\0")

// 변경 후
!bundleId ||
bundleId.includes("/") ||
bundleId.includes("\\") ||
bundleId.includes("..") ||
bundleId.includes("\0") ||
bundleId !== bundleId.toLowerCase() ||
/%[0-9a-f]{2}/i.test(bundleId) ||
!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(bundleId)
```

**`packages/legacy/src/lib/url.ts`**
- `storageKey()`는 bundleId 단일 세그먼트 전제를 유지
- `bundleFileUrl()`은 file path를 query string으로 변경:
  - 변경 전: `/w/${workspace}/b/${bundleId}/f/${filePath}`
  - 변경 후: `/w/${workspace}/b/${bundleId}/f?path=${encodeURIComponent(filePath)}`
- `apiBundleUrl()`은 `/api/w/${workspace}/bundles/${bundleId}/${endpoint}` 형태로 정리

**`packages/legacy/src/lib/bundle/upload-validation.test.ts`**
- `"rejects bundleId containing /"` 유지
- 대문자, 공백, `%2F`, `..`, 역슬래시 거부 테스트 추가
- `pr-42-run-1`, `org-repo-pr-42-run-1` 허용 테스트 추가

**`packages/legacy/src/lib/url.test.ts`**
- `storageKey("infra", "pr-42-run-1")` → `"infra/pr-42-run-1"` 테스트 추가
- `bundleFileUrl("infra", "pr-42-run-1", "logs/app.log")`
  → `"/w/infra/b/pr-42-run-1/f?path=logs%2Fapp.log"` 테스트 추가

> **근거:** bundleId를 단일 세그먼트로 제한하면 라우터별 catch-all 예외 처리를 제거할 수 있고, bundle 경로와 file path 경계를 URL 설계에서 명확히 분리할 수 있다.

---

## Phase 2: packages/shared 추출

### 이동 파일 (`packages/legacy/src/lib/` → `packages/shared/src/`)

| 원본 | 대상 |
|------|------|
| `bundle/types.ts` | `bundle/types.ts` |
| `bundle/manifest.ts` | `bundle/manifest.ts` |
| `bundle/security.ts` | `bundle/security.ts` |
| `bundle/upload-validation.ts` | `bundle/upload-validation.ts` |
| `url.ts` | `url.ts` |

**신규 생성: `packages/shared/src/bundle/validate-zip.ts`**
- `extractor.ts`에서 `validateBundleZip()` 추출 (yauzl-promise + ManifestSchema만 의존)
- CLI `eb bundle validate`와 서버 업로드 라우트 공유
- `extractor.ts` 자체는 storage/env 의존으로 legacy/api에 유지

**이동 테스트:**
- `bundle/upload-validation.test.ts` → `packages/shared/src/bundle/`
- `bundle/security.test.ts` → `packages/shared/src/bundle/`
- `url.test.ts` → `packages/shared/src/`

### `packages/shared/package.json`

```json
{
  "name": "@evidence-browser/shared",
  "version": "0.1.0",
  "private": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "yauzl-promise": "^4.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5",
    "vitest": "^4.1.2"
  },
  "files": ["dist"]
}
```

### `packages/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### `packages/shared/src/index.ts`

```typescript
export * from "./bundle/types";
export * from "./bundle/manifest";
export * from "./bundle/security";
export * from "./bundle/upload-validation";
export * from "./bundle/validate-zip";
export * from "./url";
```

### legacy에서 shared import 전환 (stub re-export)

```typescript
// packages/legacy/src/lib/bundle/types.ts
export * from "@evidence-browser/shared";

// packages/legacy/src/lib/bundle/upload-validation.ts
export * from "@evidence-browser/shared";

// packages/legacy/src/lib/url.ts
export * from "@evidence-browser/shared";
```

`extractor.ts` 내부의 manifest/security import → `@evidence-browser/shared` 직접 교체.

---

## Phase 3: packages/api — Hono 백엔드

### 3.1 패키지 구조

```
packages/api/
├── src/
│   ├── routes/
│   │   ├── auth.ts          # POST /api/auth/login, logout, GET /api/auth/me
│   │   ├── api-keys.ts      # /api/api-keys, /api/admin/api-keys
│   │   ├── workspace.ts     # GET/POST/DELETE /api/w
│   │   ├── bundle.ts        # /api/w/:ws/bundle (list, upload, meta, tree, file)
│   │   ├── admin.ts         # /api/admin/users
│   │   ├── mcp.ts           # /api/mcp (MCP Streamable HTTP)
│   │   ├── setup.ts         # /api/setup/*
│   │   └── health.ts        # /api/health
│   ├── middleware/
│   │   ├── auth.ts          # validateApiKeyOrSession() — API 키 + 세션 쿠키 통합
│   │   └── require-role.ts  # requireAdmin(), requireUpload()
│   ├── lib/                 # packages/legacy/src/lib/* 이동
│   │   ├── auth/
│   │   ├── db/
│   │   ├── storage/
│   │   ├── bundle/          # extractor.ts 포함 (server-only)
│   │   ├── files/
│   │   └── mcp/
│   ├── config/
│   │   └── env.ts           # 기존 env.ts 이동
│   └── server.ts            # Hono 앱 생성 + static 서빙 + 포트 바인딩
├── package.json
└── tsconfig.json
```

### 3.2 `packages/api/package.json`

```json
{
  "name": "@evidence-browser/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1019.0",
    "@evidence-browser/shared": "*",
    "@hono/node-server": "^1.14.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@node-rs/argon2": "^2.0.2",
    "better-sqlite3": "^12.8.0",
    "hono": "^4.7.0",
    "yauzl-promise": "^4.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "tsx": "^4.21.0",
    "typescript": "^5",
    "vitest": "^4.1.2"
  }
}
```

### 3.3 `packages/api/src/server.ts` 골격

```typescript
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { bundleRoutes } from "./routes/bundle";
import { workspaceRoutes } from "./routes/workspace";
import { adminRoutes } from "./routes/admin";
import { mcpRoutes } from "./routes/mcp";
import { healthRoutes } from "./routes/health";
import { setupRoutes } from "./routes/setup";
import { apiKeyRoutes } from "./routes/api-keys";
import { getEnv } from "./config/env";

const app = new Hono();

// API 라우트
app.route("/api/auth", authRoutes);
app.route("/api/w", workspaceRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/mcp", mcpRoutes);
app.route("/api/setup", setupRoutes);
app.route("/api/health", healthRoutes);

// Vite 빌드 정적 파일 서빙 (SPA fallback 포함)
app.use("/*", serveStatic({ root: "./public" }));
app.get("/*", async (c) => {
  // SPA fallback: index.html 반환
  return c.html(await Bun.file("./public/index.html").text());
  // Node.js: fs.readFileSync("./public/index.html", "utf-8")
});

const { PORT, HOSTNAME } = getEnv();
serve({ fetch: app.fetch, port: PORT, hostname: HOSTNAME });
```

### 3.4 인증 미들웨어 (`packages/api/src/middleware/auth.ts`)

기존 `require-auth.ts` 로직을 Hono Context 패턴으로 재작성:

```typescript
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { findApiKeyByHash, updateApiKeyLastUsed } from "../lib/db/api-keys";
import { validateSessionFromRequest } from "../lib/auth";
import type { AuthUser } from "../lib/auth/types";

// Context 타입 확장
type Variables = { user: AuthUser };

export const authenticate = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const auth = c.req.header("authorization");
    if (auth?.startsWith("Bearer eb_")) {
      const rawKey = auth.slice(7);
      const apiKey = findApiKeyByHash(rawKey);
      if (!apiKey) return c.json({ error: "Unauthorized" }, 401);
      updateApiKeyLastUsed(apiKey.id);
      c.set("user", {
        id: apiKey.user_id,
        username: `[api-key:${apiKey.key_prefix}]`,
        role: apiKey.scope === "admin" ? "admin" : "user",
      });
      return next();
    }
    // 세션 쿠키 fallback
    const user = validateSessionFromRequest(c.req.raw);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", user);
    return next();
  }
);

export const requireAdmin = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    await authenticate(c, async () => {});
    if (c.get("user")?.role !== "admin")
      return c.json({ error: "Forbidden" }, 403);
    return next();
  }
);

export const requireUpload = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const auth = c.req.header("authorization");
    if (auth?.startsWith("Bearer eb_")) {
      const apiKey = findApiKeyByHash(auth.slice(7));
      if (!apiKey) return c.json({ error: "Unauthorized" }, 401);
      if (apiKey.scope !== "upload" && apiKey.scope !== "admin")
        return c.json({ error: "Forbidden: insufficient scope" }, 403);
      updateApiKeyLastUsed(apiKey.id);
      c.set("user", { id: apiKey.user_id,
                       username: `[api-key:${apiKey.key_prefix}]`,
                       role: apiKey.scope === "admin" ? "admin" : "user" });
      return next();
    }
    const user = validateSessionFromRequest(c.req.raw);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", user);
    return next();
  }
);
```

### 3.5 번들 라우트 핵심 변환 패턴

```typescript
// packages/api/src/routes/bundle.ts
import { Hono } from "hono";
import { authenticate, requireUpload } from "../middleware/auth";

const bundle = new Hono();

bundle.get("/:ws/bundle", authenticate, async (c) => {
  const ws = c.req.param("ws");
  // ... 기존 GET 로직
});

bundle.post("/:ws/bundle", requireUpload, async (c) => {
  const body = await c.req.parseBody(); // Hono multipart 자동 처리
  const file = body["file"] as File;
  const bundleId = body["bundleId"] as string | undefined;
  // ... 기존 POST 로직
});

bundle.get("/:ws/bundles/:bundleId/meta", authenticate, async (c) => {
  const bundleId = c.req.param("bundleId");
  // ...
});

bundle.get("/:ws/bundles/:bundleId/tree", authenticate, async (c) => {
  const bundleId = c.req.param("bundleId");
  // ...
});

bundle.get("/:ws/bundles/:bundleId/file", authenticate, async (c) => {
  const bundleId = c.req.param("bundleId");
  const filePath = c.req.query("path");
  // ...
});

export const bundleRoutes = bundle;
```

> **라우팅 원칙:** bundleId는 단일 세그먼트, bundle 내부 파일 경로는 query string `path`로 분리한다. Hono/Next/TanStack 모두 같은 규칙을 사용한다.

### 3.6 `packages/api/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Phase 4: packages/web — Vite + TanStack 프론트엔드

### 4.1 패키지 구조

```
packages/web/
├── src/
│   ├── routes/                      # TanStack Router 파일 기반 라우팅
│   │   ├── __root.tsx               # 루트 레이아웃 (Header, AuthGuard)
│   │   ├── index.tsx                # / → /w 리다이렉트
│   │   ├── login.tsx                # /login
│   │   ├── setup.tsx                # /setup
│   │   ├── w/
│   │   │   └── $ws/
│   │   │       ├── index.tsx        # /w/$ws → 번들 목록
│   │   │       └── b/
│   │   │           ├── $bundleId.tsx # /w/$ws/b/$bundleId → 번들 랜딩
│   │   │           └── $bundleId.f.tsx # /w/$ws/b/$bundleId/f?path=... → 파일 뷰어
│   │   ├── admin/
│   │   │   └── index.tsx
│   │   └── settings/
│   │       └── index.tsx
│   ├── components/                  # 기존 components/* 이동 (Server Component 제거)
│   │   ├── ui/                      # shadcn 컴포넌트 (그대로 재사용)
│   │   ├── layout/
│   │   ├── file-tree/
│   │   ├── viewers/
│   │   ├── bundle/
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts                   # fetch wrapper (TanStack Query용)
│   │   └── auth.tsx                 # useAuth hook, AuthContext
│   ├── routeTree.gen.ts             # TanStack Router 자동 생성
│   ├── router.ts
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 4.2 `packages/web/package.json`

```json
{
  "name": "@evidence-browser/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@evidence-browser/shared": "*",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/router-devtools": "^1.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.7.0",
    "pretendard": "^1.3.9",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-markdown": "^10.1.0",
    "rehype-sanitize": "^6.0.0",
    "remark-gfm": "^4.0.1",
    "shiki": "^4.0.2",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4",
    "@tanstack/router-vite-plugin": "^1.0.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vite": "^6.0.0"
  }
}
```

### 4.3 `packages/web/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3001",  // dev: API 서버 프록시
    },
  },
  build: {
    outDir: "dist",
  },
});
```

### 4.4 라우팅 구조

**`src/routes/__root.tsx`** — 인증 상태 체크 + 전역 레이아웃:
```typescript
import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
```

**`src/routes/w/$ws/b/$bundleId.tsx`** — 번들 랜딩:
```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$ws/b/$bundleId")({
  component: BundleLandingPage,
});
```

**`src/routes/w/$ws/b/$bundleId.f.tsx`** — 번들 파일 뷰어:
```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$ws/b/$bundleId/f")({
  validateSearch: (search) => ({
    path: typeof search.path === "string" ? search.path : "",
  }),
  component: BundleFilePage,
});
```

**인증 가드** — TanStack Router `beforeLoad`:
```typescript
export const Route = createFileRoute("/w/$ws/")({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
});
```

### 4.5 API 클라이언트 (`src/lib/api.ts`)

```typescript
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getBundles: (ws: string) =>
    apiFetch<{ bundles: Bundle[] }>(`/api/w/${ws}/bundle`),
  uploadBundle: (ws: string, form: FormData) =>
    apiFetch(`/api/w/${ws}/bundle`, { method: "POST", body: form }),
  getWorkspaces: () =>
    apiFetch<{ workspaces: Workspace[] }>("/api/w"),
  me: () => apiFetch<{ user: AuthUser }>("/api/auth/me"),
};
```

### 4.6 기존 컴포넌트 재사용 전략

| 컴포넌트 | 재사용 방법 |
|----------|------------|
| `components/ui/*` (shadcn) | 그대로 이동 (React-only, Next.js 불필요) |
| `components/viewers/*` | 그대로 이동 |
| `components/file-tree/*` | 그대로 이동 |
| `components/layout/AppShell` | Server Component 제거, `children` props만 사용 |
| `app/**/page.tsx` | TanStack Router 라우트 컴포넌트로 변환 |

**Server Component → Client Component 변환 규칙:**
- `async function Page()` → `function Page()` + `useQuery()`로 데이터 페칭
- `import { cookies }` → 제거 (쿠키 인증은 자동으로 포함됨 — `fetch`의 `credentials: "include"`)
- `redirect()` from next/navigation → `useNavigate()` 또는 TanStack Router `redirect()`

---

## Phase 5: packages/cli — `eb` CLI

### 5.1 `packages/cli/package.json`

```json
{
  "name": "@evidence-browser/cli",
  "version": "0.1.0",
  "private": false,
  "bin": { "eb": "./dist/index.js" },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "postbuild": "chmod +x dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@evidence-browser/shared": "*",
    "archiver": "^7.0.1",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/archiver": "^7.0.0",
    "@types/node": "^20",
    "typescript": "^5"
  }
}
```

### 5.2 핵심 모듈

**`src/config.ts`** — `~/.config/evidence-browser/config.json` 관리
- `readConfig()`, `writeConfig(config)`
- `resolveToken(flag?)`: flag > `EB_TOKEN` > config.token
- `resolveServer(flag?)`: flag > `EB_SERVER` > config.server

**`src/http.ts`** — REST 클라이언트
- `HttpClient` 클래스: 모든 요청에 `Authorization: Bearer <token>`
- `get<T>()`, `post<T>()`, `postFormData<T>()`
- `ApiError(status, message)` 예외

**`src/index.ts`** — Commander.js 엔트리 (`#!/usr/bin/env node`)

### 5.3 커맨드 목록

| 파일 | 커맨드 | 동작 |
|------|--------|------|
| `commands/login.ts` | `eb login <url>` | API 키 대화형 입력 → config 저장 |
| `commands/logout.ts` | `eb logout` | config 초기화 |
| `commands/whoami.ts` | `eb whoami` | `GET /api/auth/me` |
| `commands/bundle/upload.ts` | `eb bundle upload <file> -w <slug>` | `POST /api/w/{ws}/bundle` |
| `commands/bundle/validate.ts` | `eb bundle validate <file>` | `validateBundleZip()` 로컬 실행 |
| `commands/bundle/create.ts` | `eb bundle create <dir> [-o out]` | archiver ZIP 생성 |
| `commands/bundle/list.ts` | `eb bundle list -w <slug>` | `GET /api/w/{ws}/bundle` |
| `commands/workspace/list.ts` | `eb workspace list` | `GET /api/w` |
| `commands/user/list.ts` | `eb user list` | `GET /api/admin/users` |
| `commands/user/create.ts` | `eb user create <name>` | `POST /api/admin/users` |

**`eb login` UX:**
```
$ eb login https://evidence.example.com
API key (eb_...): eb_abc123...
Logged in to https://evidence.example.com
```

**종료 코드:** 0=성공, 1=일반 오류, 2=인증 오류, 3=서버 오류

---

## Phase 6: Dockerfile 전환 (legacy → api + web)

새 패키지가 기능 동등성에 도달하면:

```dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app

# 의존성 설치
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
RUN npm ci --include=dev
RUN npm rebuild better-sqlite3 --build-from-source

# shared 빌드
COPY packages/shared ./packages/shared
RUN npm -w @evidence-browser/shared run build

# API 빌드
COPY packages/api ./packages/api
RUN npm -w @evidence-browser/api run build

# Web 빌드
COPY packages/web ./packages/web
RUN npm -w @evidence-browser/web run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# API 서버 파일
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Web 정적 파일 (Hono가 ./public 서빙)
COPY --from=builder /app/packages/web/dist ./public

RUN mkdir -p /data/bundles && chown -R nodejs:nodejs /data
VOLUME /data
USER nodejs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0" DATA_DIR=/data STORAGE_LOCAL_PATH=/data/bundles
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
```

---

## Phase 7: Changesets + CI/CD

### `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.5/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@evidence-browser/legacy", "@evidence-browser/api", "@evidence-browser/web"]
}
```

> `shared`와 `cli`만 npm 배포. api/web은 Docker로만 배포.

### `.github/workflows/ci.yml` (Phase 3 이후 최종)

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm install
      - name: Build shared
        run: npm -w @evidence-browser/shared run build
      - name: Typecheck CLI
        run: npm -w @evidence-browser/cli run typecheck
      - name: Typecheck API
        run: npm -w @evidence-browser/api run typecheck
      - name: Typecheck Web
        run: npm -w @evidence-browser/web run typecheck
      - name: Test shared
        run: npm -w @evidence-browser/shared run test
      - name: Build CLI
        run: npm -w @evidence-browser/cli run build
      - name: Build API
        run: npm -w @evidence-browser/api run build
        env:
          AUTH_SECRET: test-secret
      - name: Build Web
        run: npm -w @evidence-browser/web run build
```

### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm install
      - run: npm -w @evidence-browser/shared run build
      - run: npm -w @evidence-browser/cli run build
      - uses: changesets/action@v1
        with:
          publish: npm run changeset:publish
          title: "chore: release packages"
          commit: "chore: release packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 실행 순서 (의존 관계)

```
Phase 0: legacy 이동 (즉시 실행 가능, CI 그린 유지)
    ↓
Phase 1: bundleId flat slug 규칙 확정 (legacy 내 수정)
    ↓
Phase 2: packages/shared 추출
    ↓
Phase 3: packages/api (Hono)          ← Phase 2 완료 후
Phase 4: packages/web (Vite/TanStack) ← Phase 2 완료 후, Phase 3과 병렬 가능
    ↓
Phase 5: packages/cli
    ↓
Phase 6: Dockerfile 전환 (api+web 기능 동등성 달성 후)
Phase 7: CI/CD (Phase 0 이후 점진적 업데이트)
```

---

## 주요 위험 요소 & 대응

| 위험 | 대응 |
|------|------|
| bundleId naming collision | session/CLI 기본 규칙을 `pr-42-run-1`, `{date}-attempt1` 형태로 고정하고, 업로드 시 중복 에러를 명시적으로 노출 |
| 파일 경로 URL 전달 시 인코딩 누락 | bundle 내부 파일 경로는 path segment가 아니라 `?path=` query로만 전달하고, 클라이언트 helper에서만 URL 생성 |
| MCP SSE 스트리밍 Hono 호환 | `@modelcontextprotocol/sdk`의 HTTP 어댑터 패턴 유지 |
| better-sqlite3 빌드 (Alpine) | Phase 6 Dockerfile에서 `npm rebuild` 유지 |
| TanStack Router 인증 가드 | `beforeLoad`에서 `/api/auth/me` 체크, 실패 시 `/login` redirect |
| shadcn 컴포넌트 Next.js import 잔존 | `next/image`, `next/link` → 표준 `<img>`, `<a>` 또는 TanStack Link로 교체 |
| one-shot cutover 중 회귀 범위 확대 | Phase 3/4 완료 후 legacy와 api/web를 병렬 배포하지 않고, 브랜치에서 전체 검증 후 한 번에 전환 |

---

## 검증 방법

1. **Phase 0:** `npm -w @evidence-browser/legacy run dev` → 기존 기능 회귀 없음
2. **Phase 1:** `npm -w @evidence-browser/legacy run test` 통과, `pr-42-run-1` bundleId 업로드 성공
3. **Phase 2:** `npm -w @evidence-browser/shared run build && npm -w @evidence-browser/shared run test`
4. **Phase 3:** `curl -H "Authorization: Bearer eb_..." http://localhost:3001/api/health` 응답 확인
5. **Phase 4:** `npm -w @evidence-browser/web run build` 정적 파일 생성, 브라우저에서 전체 플로우 동작
6. **Phase 5:**
   ```bash
   npm -w @evidence-browser/cli run build
   node packages/cli/dist/index.js bundle validate fixtures/fixture-basic.zip
   ```
7. **Phase 6:** Docker 빌드 후 `docker run -p 3000:3000 ...` → Hono가 API + 정적 파일 서빙 확인
