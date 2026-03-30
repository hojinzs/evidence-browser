# Evidence Browser v0 — 수용 기준

이 문서는 Evidence Browser v0의 수용 기준(Acceptance Criteria)을 정의한다.
모든 항목은 로컬 환경에서 100% 셀프 테스트 가능하다.

---

## 0. 테스트 환경

### 로컬 인프라

```yaml
# docker-compose.test.yml
services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"    # S3 API
      - "9001:9001"    # Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
```

```bash
# 테스트 환경 실행
docker compose -f docker-compose.test.yml up -d

# 샘플 bundle 생성 (Local FS + MinIO 모두에 배치)
npm run seed              # → ./data/bundles/ (local)
npm run seed:s3           # → MinIO evidence-test bucket
```

### 환경변수 프리셋

```bash
# .env.test.local — 로컬 파일시스템 테스트
AUTH_BYPASS=true
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./data/bundles
NEXTAUTH_SECRET=test-secret
NEXTAUTH_URL=http://localhost:3000

# .env.test.s3 — MinIO (S3 호환) 테스트
AUTH_BYPASS=true
STORAGE_TYPE=s3
S3_BUCKET=evidence-test
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
NEXTAUTH_SECRET=test-secret
NEXTAUTH_URL=http://localhost:3000
```

### 테스트 실행

```bash
# 모드 1: Local FS
cp .env.test.local .env.local && npm run dev

# 모드 2: MinIO S3
cp .env.test.s3 .env.local && npm run dev

# 자동화 테스트
npm test                  # unit + integration
npm run test:e2e          # Playwright e2e (선택, v0 후반)
```

---

## 1. 테스트 Fixture

모든 AC를 검증하기 위해 아래 fixture bundle들을 `npm run seed`로 생성한다.

### fixture-basic

기본 동작 검증용. 가장 표준적인 bundle.

```
fixture-basic.zip
├── manifest.json         # { version: 1, title: "Basic Test", index: "index.md" }
├── index.md              # 요약 + 내부 링크 + 인라인 이미지 포함
├── logs/
│   ├── app.log           # 텍스트 로그 (200줄)
│   └── error.log         # 짧은 에러 로그
├── screenshots/
│   ├── step-1.png        # PNG 이미지
│   └── step-2.jpg        # JPG 이미지
├── scripts/
│   ├── setup.sh          # Shell 스크립트
│   └── test.py           # Python 스크립트
├── results/
│   └── output.json       # JSON 결과 파일
└── notes.md              # 보조 Markdown 문서
```

`index.md` 내용 (핵심 부분):
```markdown
# Basic Test Evidence

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

`인라인 코드` 테스트
```

### fixture-deep

깊은 중첩 폴더 구조 검증용.

```
fixture-deep.zip
├── manifest.json
├── index.md
└── a/
    └── b/
        └── c/
            └── d/
                └── e/
                    └── deep-file.txt
```

### fixture-large-tree

많은 파일 수 트리 렌더링 검증용.

```
fixture-large-tree.zip
├── manifest.json
├── index.md
├── dir-01/ ~ dir-10/          # 10개 디렉토리
│   ├── file-001.txt ~ file-010.txt  # 각 10개 파일
│   └── sub/
│       └── nested.log
```

총 파일 수: ~120개

### fixture-markdown-rich

Markdown 렌더링 완전성 검증용.

```
fixture-markdown-rich.zip
├── manifest.json
├── index.md               # 모든 GFM 요소 포함
├── docs/
│   └── sub-doc.md         # 상대경로 링크 대상
├── images/
│   ├── diagram.png
│   ├── photo.jpg
│   ├── icon.svg
│   └── animated.gif
└── code/
    └── example.ts
```

`index.md`에는 heading, paragraph, list, blockquote, fenced code block,
inline code, table, link, image, thematic break, task list, strikethrough 모두 포함.
`docs/sub-doc.md`에서 `../images/diagram.png`처럼 상위 디렉토리 상대경로 참조.

### fixture-invalid-manifest

잘못된 manifest 처리 검증용.

```
fixture-invalid-manifest.zip
├── manifest.json          # { version: 1 }  ← title, index 누락
└── index.md
```

### fixture-no-manifest

manifest 없는 bundle 처리 검증용.

```
fixture-no-manifest.zip
└── index.md
```

### fixture-no-index

index.md 없는 bundle 처리 검증용.

```
fixture-no-index.zip
├── manifest.json          # { version: 1, title: "No Index", index: "index.md" }
└── logs/
    └── app.log
```

### fixture-binary

바이너리 파일 처리 검증용.

```
fixture-binary.zip
├── manifest.json
├── index.md
├── data.bin               # 임의 바이너리
├── archive.tar.gz         # 중첩 아카이브
└── document.pdf           # PDF 파일
```

### fixture-security

보안 검증용. 실제 악의적 파일은 포함하지 않되, 경계 조건을 테스트.

```
fixture-security.zip
├── manifest.json
├── index.md               # raw HTML, <script>, <iframe> 태그 포함
├── normal-file.txt
└── logs/
    └── safe.log
```

`index.md` 내용:
```markdown
# Security Test

<script>alert('xss')</script>

<iframe src="https://evil.example.com"></iframe>

<img src="x" onerror="alert('xss')">

[정상 링크](normal-file.txt)

[Path traversal 시도](../../../etc/passwd)
```

### fixture-unicode

유니코드 파일명/내용 처리 검증용.

```
fixture-unicode.zip
├── manifest.json
├── index.md
├── 한글파일.txt
├── données/
│   └── résultat.json
└── 日本語/
    └── テスト.log
```

---

## 2. 수용 기준

### 인증

#### AC-01: 미인증 사용자 접근 차단 (US-01)

- **Given** AUTH_BYPASS=false이고 사용자가 로그인하지 않은 상태
- **When** `/b/sample/test-run` 에 접근한다
- **Then** `/login` 페이지로 리다이렉트된다
- **검증**: curl로 `/b/sample/test-run` 요청 → 302 + Location: /login

#### AC-02: 미인증 사용자 API 접근 차단 (US-01)

- **Given** AUTH_BYPASS=false이고 사용자가 로그인하지 않은 상태
- **When** `/api/bundle/{bundleId}/meta` 에 접근한다
- **Then** 401 Unauthorized를 반환한다
- **검증**: curl로 API 요청 → 401

#### AC-03: 인증 바이패스 모드 (개발용)

- **Given** AUTH_BYPASS=true이고 NODE_ENV=development
- **When** `/b/sample/test-run` 에 접근한다
- **Then** 로그인 없이 bundle을 볼 수 있다
- **검증**: dev 모드 실행 후 브라우저에서 바로 접근 가능

#### AC-04: OIDC 로그인 플로우

- **Given** AUTH_BYPASS=false이고 OIDC provider가 설정됨
- **When** `/login` 페이지에서 로그인 버튼을 클릭한다
- **Then** OIDC provider의 인증 페이지로 리다이렉트되고, 인증 후 원래 페이지로 돌아온다
- **검증**: docker compose로 mock OIDC provider 구동 후 전체 플로우 테스트
- **참고**: 이 AC는 실제 OIDC provider(Authentik 등) 연동 시 검증. 로컬에서는 AC-03으로 우회 가능

#### AC-05: 로그아웃

- **Given** 인증된 상태
- **When** 로그아웃 버튼을 클릭한다
- **Then** 세션이 종료되고 `/login`으로 리다이렉트된다
- **검증**: 로그아웃 후 bundle 페이지 접근 시 리다이렉트 확인

---

### Bundle 로딩

#### AC-10: 유효한 bundle 로딩 — Local FS (US-02)

- **Given** STORAGE_TYPE=local, `data/bundles/sample/test-run.zip`이 존재
- **When** `/b/sample/test-run` 에 접근한다
- **Then** bundle이 로딩되고 index.md 내용이 렌더링된다
- **Fixture**: fixture-basic
- **검증**: 페이지에 manifest의 title과 index.md 렌더링 결과가 표시됨

#### AC-11: 유효한 bundle 로딩 — S3/MinIO (US-02)

- **Given** STORAGE_TYPE=s3, MinIO의 `evidence-test` 버킷에 `sample/test-run.zip`이 존재
- **When** `/b/sample/test-run` 에 접근한다
- **Then** bundle이 로딩되고 index.md 내용이 렌더링된다
- **Fixture**: fixture-basic (MinIO에 업로드)
- **검증**: Local FS와 동일한 결과

#### AC-12: 존재하지 않는 bundle 접근

- **Given** 스토리지에 해당 bundle이 없음
- **When** `/b/nonexistent/bundle` 에 접근한다
- **Then** 404 페이지가 표시된다 (의미 있는 에러 메시지 포함)
- **검증**: 404 상태 코드 + "Bundle을 찾을 수 없습니다" 메시지

#### AC-13: 슬래시 포함 bundle ID

- **Given** bundle ID가 `org/repo/pr-182/run-1`
- **When** `/b/org/repo/pr-182/run-1` 에 접근한다
- **Then** 올바르게 파싱되어 bundle이 로딩된다
- **Fixture**: fixture-basic을 `org/repo/pr-182/run-1.zip` 경로에 배치
- **검증**: URL segments가 정확히 파싱됨

#### AC-14: Bundle 캐시 동작

- **Given** bundle이 이미 한 번 로딩되어 /tmp에 캐시됨
- **When** 같은 bundle에 다시 접근한다
- **Then** 캐시에서 로딩되어 첫 번째 요청보다 빠르게 응답한다
- **검증**: 두 번째 요청의 응답 시간이 첫 번째보다 현저히 짧음 (서버 로그에서 cache hit 확인)

#### AC-15: 대용량 bundle 크기 제한

- **Given** MAX_BUNDLE_SIZE보다 큰 zip 파일
- **When** 해당 bundle에 접근한다
- **Then** 에러 메시지와 함께 로딩이 거부된다
- **검증**: 413 또는 적절한 에러 코드 + 크기 초과 메시지

---

### Manifest 검증

#### AC-20: 유효한 manifest 파싱 (US-05)

- **Given** manifest.json이 `{ "version": 1, "title": "Test", "index": "index.md" }`
- **When** bundle을 로딩한다
- **Then** title이 페이지 헤더에 표시된다
- **Fixture**: fixture-basic

#### AC-21: manifest 누락

- **Given** bundle에 manifest.json이 없음
- **When** bundle을 로딩한다
- **Then** 에러 페이지가 표시된다 ("manifest.json을 찾을 수 없습니다")
- **Fixture**: fixture-no-manifest

#### AC-22: manifest 필수 필드 누락

- **Given** manifest.json에 title 또는 index가 누락됨
- **When** bundle을 로딩한다
- **Then** 에러 페이지가 표시된다 (누락된 필드를 명시)
- **Fixture**: fixture-invalid-manifest

#### AC-23: manifest가 가리키는 index 파일 부재

- **Given** manifest.json의 index가 "index.md"이지만 해당 파일이 bundle에 없음
- **When** bundle을 로딩한다
- **Then** 에러 페이지가 표시된다 ("index.md를 찾을 수 없습니다")
- **Fixture**: fixture-no-index

#### AC-24: 추가 필드가 있는 manifest 허용

- **Given** manifest.json에 version, title, index 외 추가 필드가 있음
- **When** bundle을 로딩한다
- **Then** 정상 로딩된다 (추가 필드는 무시)
- **검증**: `{ "version": 1, "title": "T", "index": "index.md", "extra": "ok" }` → 정상

---

### Markdown 렌더링

#### AC-30: 기본 Markdown 렌더링 (US-02)

- **Given** bundle의 index.md에 heading, paragraph, list가 포함
- **When** bundle landing 페이지를 연다
- **Then** Markdown이 HTML로 올바르게 렌더링된다
- **Fixture**: fixture-basic
- **검증**: h1, p, ul/ol 요소가 올바르게 표시

#### AC-31: GFM 테이블 렌더링

- **Given** index.md에 GFM 테이블이 포함
- **When** bundle landing 페이지를 연다
- **Then** 테이블이 올바르게 렌더링된다
- **Fixture**: fixture-basic
- **검증**: `<table>` 요소에 행과 열이 정확히 표시

#### AC-32: GFM Task List 렌더링

- **Given** index.md에 `- [x]`, `- [ ]` 형식 task list가 포함
- **When** bundle landing 페이지를 연다
- **Then** 체크박스가 포함된 리스트로 렌더링된다 (읽기 전용)
- **Fixture**: fixture-basic

#### AC-33: GFM Strikethrough 렌더링

- **Given** index.md에 `~~텍스트~~`가 포함
- **When** bundle landing 페이지를 연다
- **Then** 취소선이 적용된 텍스트로 렌더링된다
- **Fixture**: fixture-basic

#### AC-34: Fenced Code Block 렌더링

- **Given** index.md에 fenced code block이 포함
- **When** bundle landing 페이지를 연다
- **Then** 코드 블록이 구분된 영역으로 렌더링된다
- **Fixture**: fixture-markdown-rich

#### AC-35: Blockquote 렌더링

- **Given** index.md에 `>` blockquote가 포함
- **When** bundle landing 페이지를 연다
- **Then** 인용문 스타일로 렌더링된다
- **Fixture**: fixture-basic

#### AC-36: 인라인 이미지 렌더링 (US-02)

- **Given** index.md에 `![alt](screenshots/step-1.png)` 형태의 이미지 참조가 있음
- **When** bundle landing 페이지를 연다
- **Then** bundle 내부의 이미지가 인라인으로 렌더링된다
- **Fixture**: fixture-basic
- **검증**: `<img>` 요소의 src가 `/api/bundle/.../file?path=screenshots/step-1.png` 형태

---

### 파일 트리

#### AC-40: 파일 트리 표시 (US-03)

- **Given** bundle이 로딩됨
- **When** bundle 페이지를 연다
- **Then** 좌측(또는 사이드)에 파일 트리가 표시된다
- **Fixture**: fixture-basic
- **검증**: 트리에 manifest.json, index.md, logs/, screenshots/ 등이 표시

#### AC-41: 폴더 접기/��치기 (US-03)

- **Given** 파일 트리에 폴더가 표시됨
- **When** 폴더를 클릭한다
- **Then** 하위 항목이 펼쳐지거나 접힌다
- **Fixture**: fixture-basic

#### AC-42: 파일 클릭 시 뷰어 열기 (US-03)

- **Given** 파일 트리가 표시됨
- **When** 파일 트리에서 `logs/app.log`를 클릭한다
- **Then** URL이 `/b/{bundleId}/f/logs/app.log`로 변경되고 파일 내용이 표시된다
- **Fixture**: fixture-basic

#### AC-43: 현재 파일 하이라이트 (US-03)

- **Given** `/b/{bundleId}/f/logs/app.log` 에 있음
- **When** 파일 트리를 본다
- **Then** `logs/app.log` 항목이 하이라이트되어 있다
- **Fixture**: fixture-basic

#### AC-44: 깊은 중첩 폴더 표시

- **Given** 5단계 이상 중첩된 폴더 구조
- **When** 파일 트리를 탐색한다
- **Then** 모든 레벨의 폴더가 접기/펼치기 가능하다
- **Fixture**: fixture-deep

#### AC-45: 많은 파일 트리 성능

- **Given** 100개 이상의 파일이 포함된 bundle
- **When** 파일 트리를 렌더링한다
- **Then** 3초 이내에 트리가 완전히 표시된다
- **Fixture**: fixture-large-tree

---

### 파일 뷰어

#### AC-50: Markdown 파일 뷰어 (US-04)

- **Given** 파일 트리에서 `.md` 파일을 선택
- **When** 파일이 열린다
- **Then** Markdown이 렌더링된 형태로 표시된다
- **Fixture**: fixture-basic → `notes.md`

#### AC-51: 이미지 뷰어

- **Given** 파일 트리에서 `.png` 파일을 선택
- **When** 파일이 열린다
- **Then** 이미지가 화면에 표시된다
- **Fixture**: fixture-basic → `screenshots/step-1.png`
- **검증**: PNG, JPG 모두 확인

#### AC-52: 코드 뷰어 — Syntax Highlight

- **Given** 파일 트리에서 `.py` 파일을 선택
- **When** 파일이 열린다
- **Then** Python 구문에 맞는 syntax highlight가 적용된다
- **Fixture**: fixture-basic → `scripts/test.py`
- **검증**: 키워드, 문자열, 주석 등이 색상으로 구분됨

#### AC-53: 코드 뷰어 — 라인 넘버

- **Given** 코드 뷰어가 열림
- **When** 코드 파일을 본다
- **Then** 각 줄에 라인 번호가 표시된다
- **Fixture**: fixture-basic → `scripts/setup.sh`

#### AC-54: 텍스트/로그 뷰어

- **Given** 파일 트리에서 `.log` 파일을 선택
- **When** 파일이 열린다
- **Then** 텍스트가 monospace 폰트, 라인 넘버와 함께 표시된다
- **Fixture**: fixture-basic → `logs/app.log`

#### AC-55: JSON 뷰어

- **Given** 파일 트리에서 `.json` 파일을 선택
- **When** 파일이 열린다
- **Then** JSON에 syntax highlight가 적용되어 표시된다
- **Fixture**: fixture-basic → `results/output.json`

#### AC-56: Shell 스크립트 뷰어

- **Given** 파일 트리에서 `.sh` 파일을 선택
- **When** 파일이 열린다
- **Then** Shell 구문에 맞는 syntax highlight가 적용된다
- **Fixture**: fixture-basic → `scripts/setup.sh`

#### AC-57: 바이너리 파일 Fallback

- **Given** 파일 트리에서 `.bin` 또는 `.tar.gz` 파일을 선택
- **When** 파일이 열린다
- **Then** "미리보기를 지원하지 않는 파일입니다" 메시지와 다운로드 버튼이 표시된다
- **Fixture**: fixture-binary

#### AC-58: SVG 이미지 렌더링

- **Given** 파일 트리에서 `.svg` 파일을 선택
- **When** 파일이 열린다
- **Then** SVG가 이미지로 렌더링된다 (raw SVG 코드가 아닌 시각적 결과)
- **Fixture**: fixture-markdown-rich → `images/icon.svg`

---

### 내비게이션

#### AC-60: 내부 링크 클릭 → 파일 열기 (US-04)

- **Given** index.md에 `[앱 로그](logs/app.log)` 링크가 있음
- **When** 해당 링크를 클릭한다
- **Then** `/b/{bundleId}/f/logs/app.log`로 이동하고 파일이 표시된다
- **Fixture**: fixture-basic

#### AC-61: 외부 링크 새 탭에서 열기

- **Given** index.md에 `[GitHub PR](https://github.com/...)` 링크가 있음
- **When** 해당 링크를 클릭한다
- **Then** 새 탭에서 외부 URL이 열린다 (`target="_blank"`)
- **Fixture**: fixture-basic

#### AC-62: Markdown 간 상대경로 내비게이션

- **Given** `docs/sub-doc.md`에 `[메인으로](../index.md)` 링크가 있음
- **When** 해당 링크를 클릭한다
- **Then** `/b/{bundleId}/f/index.md`로 이동한다
- **Fixture**: fixture-markdown-rich

#### AC-63: Markdown 내 앵커 링크

- **Given** index.md에 `[요약으로](#요약)` 앵커 링크가 있음
- **When** 해당 링크를 클릭한다
- **Then** 같은 페이지의 해당 heading으로 스크롤된다
- **Fixture**: fixture-markdown-rich

#### AC-64: URL 직접 접근 — bundle landing

- **Given** 유효한 bundle이 존재
- **When** 브라우저에 `/b/{bundleId}`를 직접 입력한다
- **Then** bundle landing 페이지(index.md)가 표시된다
- **Fixture**: fixture-basic

#### AC-65: URL 직접 접근 — 파일 deep link

- **Given** 유효한 bundle이 존재
- **When** 브라우저에 `/b/{bundleId}/f/logs/app.log`를 직접 입력한다
- **Then** 파일 트리 + 해당 파일 뷰어가 바로 표시된다
- **Fixture**: fixture-basic

---

### 보안

#### AC-70: Path traversal 차단 — URL (PRD 12절)

- **Given** bundle이 로딩됨
- **When** `/b/{bundleId}/f/../../../etc/passwd` 에 접근한다
- **Then** 400 또는 403 에러가 반환된다
- **검증**: curl로 요청, bundle root 밖 파일에 접근 불가

#### AC-71: Path traversal 차단 — API

- **Given** bundle이 로딩됨
- **When** `/api/bundle/{id}/file?path=../../../etc/passwd` 에 요청한다
- **Then** 400 또는 403 에러가 반환된다
- **검증**: curl로 API 요청

#### AC-72: HTML sanitization — script 태그

- **Given** index.md에 `<script>alert('xss')</script>`가 포함
- **When** bundle landing을 연다
- **Then** script 태그가 제거되거나 무력화되어 실행되지 않는다
- **Fixture**: fixture-security
- **검증**: DOM에 `<script>` 요소 없음

#### AC-73: HTML sanitization — iframe 태그

- **Given** index.md에 `<iframe src="..."></iframe>`가 포함
- **When** bundle landing을 연다
- **Then** iframe 태그가 제거되어 외부 콘텐츠가 로드되지 않는다
- **Fixture**: fixture-security

#### AC-74: HTML sanitization — event handler

- **Given** index.md에 `<img src="x" onerror="alert('xss')">`가 포함
- **When** bundle landing을 연다
- **Then** onerror 속성이 제거되어 스크립트가 실행되지 않는다
- **Fixture**: fixture-security

#### AC-75: Markdown 내 path traversal 링크

- **Given** index.md에 `[evil](../../../etc/passwd)` 링크가 있음
- **When** 해당 링크를 클릭한다
- **Then** 에러 페이지가 표시되거나 요청이 차단된다 (bundle 외부 파일은 접근 불가)
- **Fixture**: fixture-security

#### AC-76: 파일 응답 CSP 헤더

- **Given** 파일 뷰어에서 파일을 요청
- **When** `/api/bundle/{id}/file?path=...` 응답을 확인한다
- **Then** `Content-Security-Policy` 헤더에 `script-src 'none'`이 포함된다
- **검증**: curl -I로 헤더 확인

#### AC-77: Zip bomb 방어

- **Given** 파일 수가 MAX_FILE_COUNT를 초과하는 zip
- **When** 해당 bundle에 접근한다
- **Then** 해제가 중단되고 에러 메시지가 표시된다
- **검증**: 파일 수 제한 초과 시 적절한 에러 반환

#### AC-78: 미인증 상태 API 직접 호출 차단

- **Given** AUTH_BYPASS=false, 미인증 상태
- **When** `/api/bundle/{id}/file?path=logs/app.log` 에 직접 요청
- **Then** 401이 반환된다 (파일 내용 노출 없음)
- **검증**: curl로 확인

---

### 스토리지 어댑터

#### AC-80: Local FS 어댑터 동작

- **Given** STORAGE_TYPE=local, STORAGE_LOCAL_PATH에 zip이 존재
- **When** bundle을 로딩한다
- **Then** 로컬 파일시스템에서 zip을 읽어 정상 동작한다
- **Fixture**: fixture-basic → `./data/bundles/sample/test-run.zip`

#### AC-81: S3 어댑터 동작 (MinIO)

- **Given** STORAGE_TYPE=s3, MinIO에 zip이 존재
- **When** bundle을 로딩한다
- **Then** S3 프로토콜로 MinIO에서 zip을 읽어 정상 동작한다
- **Fixture**: fixture-basic → MinIO `evidence-test/sample/test-run.zip`
- **검증**: Local FS 테스트와 동일한 결과

#### AC-82: S3 path style 지원

- **Given** S3_FORCE_PATH_STYLE=true (MinIO 등 path-style 필요한 환경)
- **When** S3 어댑터가 요청을 보낸다
- **Then** virtual-hosted style이 아닌 path style로 요청한다
- **검증**: MinIO에서 정상 동작 (MinIO는 path style만 지원)

#### AC-83: 존재하지 않는 스토리지 경로

- **Given** 스토리지에 해당 경로의 zip이 없음
- **When** bundle을 로딩한다
- **Then** 404가 반환된다
- **검증**: Local FS, MinIO 모두에서 확인

#### AC-84: 스토리지 설정 누락 시 에러

- **Given** STORAGE_TYPE=s3이지만 S3_BUCKET이 설정되지 않음
- **When** 서버가 시작된다
- **Then** 명확한 에러 메시지와 함께 시작이 실패한다
- **검증**: 환경변수 누락 시 서버 기동 실패 + 에러 로그

---

### 반응형

#### AC-90: 데스크톱 레이아웃

- **Given** 뷰포트 너비 >= 1024px
- **When** bundle 페이지를 연다
- **Then** 좌측에 파일 트리, 우측에 콘텐츠 영역이 나란히 표시된다
- **Fixture**: fixture-basic

#### AC-91: 모바일 레이아웃

- **Given** 뷰포트 너비 < 768px
- **When** bundle 페이지를 연다
- **Then** 파일 트리가 숨겨지고 토글 버튼(또는 drawer)으로 접근 가능하다. 콘텐츠가 전체 너비를 차지한다.
- **Fixture**: fixture-basic

#### AC-92: 모바일에서 파일 트리 토글

- **Given** 모바일 뷰포트에서 bundle 페이지
- **When** 파일 트리 토글 버튼을 누른다
- **Then** 파일 트리가 drawer/overlay로 나타나고, 파일 선택 시 닫힌다
- **Fixture**: fixture-basic

---

### 유니코드

#### AC-95: 유니코드 파일명 표시

- **Given** bundle에 한글, 일본어, 특수문자가 포함된 파일명이 있음
- **When** 파일 트리를 본다
- **Then** 파일명이 깨지지 않고 올바르게 표시된다
- **Fixture**: fixture-unicode

#### AC-96: 유니코드 파일 내용 표시

- **Given** 유니코드 파일명의 텍스트 파일을 선택
- **When** 파일 뷰어가 열린다
- **Then** 내용이 올바르게 표시된다
- **Fixture**: fixture-unicode

---

## 3. 테스트 매트릭스

각 AC가 어느 환경에서 검증되는지 표시.

| AC | Local FS | MinIO S3 | Auth Bypass | Auth OIDC |
|----|:--------:|:--------:|:-----------:|:---------:|
| AC-01 | | | | O |
| AC-02 | | | | O |
| AC-03 | O | | O | |
| AC-04 | | | | O |
| AC-05 | | | | O |
| AC-10 | O | | O | |
| AC-11 | | O | O | |
| AC-12 | O | O | O | |
| AC-13 | O | O | O | |
| AC-14 | O | | O | |
| AC-15 | O | | O | |
| AC-20~24 | O | | O | |
| AC-30~36 | O | | O | |
| AC-40~45 | O | | O | |
| AC-50~58 | O | | O | |
| AC-60~65 | O | | O | |
| AC-70~78 | O | | O | |
| AC-80 | O | | O | |
| AC-81~82 | | O | O | |
| AC-83 | O | O | O | |
| AC-84 | | O | O | |
| AC-90~92 | O | | O | |
| AC-95~96 | O | | O | |

---

## 4. 로컬 전체 테스트 실행 가이드

### 사전 조건

- Node.js >= 20
- Docker + Docker Compose
- npm >= 10

### Step 1: 프로젝트 설치

```bash
git clone <repo> && cd evidence-browser
npm install
```

### Step 2: MinIO 실행

```bash
docker compose -f docker-compose.test.yml up -d
```

MinIO Console: http://localhost:9001 (minioadmin / minioadmin)

### Step 3: 테스트 fixture 생성

```bash
npm run seed           # Local FS에 모든 fixture 배치
npm run seed:s3        # MinIO에 모든 fixture 업로드
```

### Step 4: Local FS 모드 테스트

```bash
cp .env.test.local .env.local
npm run dev
```

- http://localhost:3000/b/sample/basic → fixture-basic
- http://localhost:3000/b/sample/deep → fixture-deep
- http://localhost:3000/b/sample/large-tree → fixture-large-tree
- http://localhost:3000/b/sample/markdown-rich → fixture-markdown-rich
- http://localhost:3000/b/sample/security → fixture-security
- http://localhost:3000/b/sample/unicode → fixture-unicode
- http://localhost:3000/b/sample/invalid-manifest → fixture-invalid-manifest
- http://localhost:3000/b/sample/no-manifest → fixture-no-manifest
- http://localhost:3000/b/sample/no-index → fixture-no-index
- http://localhost:3000/b/sample/binary → fixture-binary

### Step 5: MinIO S3 모드 테스트

```bash
cp .env.test.s3 .env.local
npm run dev
```

동일한 URL로 접근하여 S3 어댑터 동작 확인.

### Step 6: 보안 테스트

```bash
# Path traversal
curl -v http://localhost:3000/api/bundle/sample%2Fbasic/file?path=../../../etc/passwd
# → 400 또는 403

# 미인증 접근 (AUTH_BYPASS=false로 변경 후)
curl -v http://localhost:3000/api/bundle/sample%2Fbasic/meta
# → 401

# CSP 헤더
curl -I http://localhost:3000/api/bundle/sample%2Fbasic/file?path=logs/app.log
# → Content-Security-Policy: script-src 'none'
```

### Step 7: 자동화 테스트

```bash
npm test              # unit (url 파싱, 보안, manifest 검증 등)
npm run test:e2e      # e2e (선택, Playwright)
```

### Step 8: 정리

```bash
docker compose -f docker-compose.test.yml down
```
