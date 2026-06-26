# Evidence Browser CLI (`eb`)

## 개요

`eb`는 Evidence Browser 서버와 통신하는 커맨드라인 도구입니다.
CI 파이프라인과 AI 에이전트가 evidence bundle을 만들고, 검증하고,
업로드하고, 이후 필요한 파일을 다시 조회할 수 있게 합니다.

현재 CLI는 서버 API만 사용합니다. 인증은 브라우저 세션 쿠키가 아니라
Evidence Browser API key로 처리합니다.

---

## 설치

```bash
npm install -g evidence-browser-cli
```

개발 체크아웃에서는 workspace 스크립트로 빌드하거나 실행할 수 있습니다.

```bash
npm install
npm run build:cli
node packages/cli/dist/bin.js --help
```

---

## 인증과 설정

### API key

1. 브라우저에서 Evidence Browser에 로그인합니다.
2. Settings/API Keys 화면에서 API key를 생성합니다.
3. CLI에서 `eb login <url>`을 실행하고 API key를 입력합니다.

```bash
eb login https://evidence.example.com
# API key: eb_...
```

`eb login`은 입력한 key를 검증한 뒤 로컬 설정 파일에 저장합니다.

### 설정 파일

기본 저장 위치:

```text
~/.config/evidence-browser/config.json
```

내용:

```json
{
  "url": "https://evidence.example.com",
  "apiKey": "eb_..."
}
```

`XDG_CONFIG_HOME`이 설정되어 있으면
`$XDG_CONFIG_HOME/evidence-browser/config.json`을 사용합니다.

### 우선순위

서버 URL과 API key는 다음 순서로 결정됩니다. 앞의 값이 뒤의 값을
덮어씁니다.

1. 명령 플래그: `--url`, `--api-key`
2. 환경변수: `EB_URL`, `EB_API_KEY`
3. 로컬 설정 파일: `config.json`

### CI 환경변수

| 변수 | 설명 |
|------|------|
| `EB_URL` | Evidence Browser 서버 URL |
| `EB_API_KEY` | `read`, `upload`, 또는 `admin` scope를 가진 API key |

예시:

```bash
EB_URL=https://evidence.example.com \
EB_API_KEY=$EVIDENCE_BROWSER_API_KEY \
eb upload dist/evidence.zip --workspace ci-results --bundle-id "pr-42-run-1"
```

---

## 빠른 시작

```bash
eb login https://evidence.example.com
eb bundle create ./evidence --output dist/evidence.zip
eb bundle validate dist/evidence.zip
eb upload dist/evidence.zip --workspace ci-results --bundle-id "pr-42-run-1"
```

서버에 이미 ZIP bundle이 있으면 생성 단계 없이 바로 업로드할 수 있습니다.

```bash
eb upload report.zip --workspace default
```

---

## 명령 레퍼런스

### `eb login [url]`

서버 URL과 API key를 저장합니다. `url`을 생략하면 프롬프트로 입력받습니다.

```bash
eb login https://evidence.example.com
```

성공 시 저장된 서버, masked key, 설정 파일 경로를 출력합니다.

### `eb logout`

저장된 로컬 설정 파일을 삭제합니다.

```bash
eb logout
```

### `eb whoami`

현재 설정된 서버 URL, masked API key, 설정 파일 경로, 인증 상태를 출력합니다.
서버에 연결해 key가 유효한지도 확인합니다.

```bash
eb whoami
```

---

## Upload

### `eb upload <file>`

ZIP bundle을 워크스페이스에 업로드합니다. 이것이 구현된 업로드 명령입니다.
`eb bundle upload` 하위 명령은 없습니다.

```bash
eb upload <file> --workspace <slug> [--bundle-id <id>] [--url <url>] [--api-key <key>]
```

| 옵션 | 설명 |
|------|------|
| `--workspace <slug>` | 업로드 대상 워크스페이스 slug |
| `--bundle-id <id>` | 번들 ID를 파일명 대신 명시 |
| `--url <url>` | 서버 URL override |
| `--api-key <key>` | API key override |

```bash
eb upload report.zip --workspace ci-results
eb upload report.zip --workspace ci-results --bundle-id "pr-42-run-1"
```

업로드 성공 시 bundle ID와 viewer URL을 출력합니다.

---

## Bundle

### `eb bundle create <dir>`

디렉터리를 bundle ZIP으로 패키징합니다.

```bash
eb bundle create <dir> [--output <file>] [--title <title>] [--index <path>]
```

| 옵션 | 설명 |
|------|------|
| `--output`, `-o` | 출력 ZIP 경로 |
| `--title <title>` | 생성할 `manifest.json`의 title |
| `--index <path>` | 생성할 `manifest.json`의 index 파일 |

디렉터리에 `manifest.json`이 이미 있으면 그대로 사용합니다. 없으면 CLI가
`version`, `title`, `index`를 가진 manifest를 생성합니다. `--index`가 없으면
루트 `index.md`, 그 다음 첫 번째 Markdown 파일을 찾습니다.

```bash
eb bundle create ./report --output dist/report.zip --title "PR #42 evidence"
```

### `eb bundle validate <file>`

서버 연결 없이 로컬 bundle ZIP을 검증합니다.

```bash
eb bundle validate report.zip
```

검증 항목:

- ZIP 파일 존재와 확장자
- `manifest.json` 존재와 JSON 파싱
- `version`, `title`, `index` 필수 필드
- `index`가 가리키는 파일 존재

### `eb bundle list <workspace>`

워크스페이스의 bundle 목록을 JSON으로 출력합니다.

```bash
eb bundle list ci-results
```

### `eb bundle info <workspace> <bundleId>`

bundle manifest와 파일 트리 metadata를 JSON으로 출력합니다.

```bash
eb bundle info ci-results pr-42-run-1
```

### `eb bundle tree <workspace> <bundleId>`

bundle 파일 트리를 터미널 tree 형식으로 출력합니다.

```bash
eb bundle tree ci-results pr-42-run-1
```

### `eb bundle download <workspace> <bundleId>`

bundle 내부 파일 하나를 stdout으로 출력합니다.

```bash
eb bundle download ci-results pr-42-run-1 --file logs/app.log > app.log
```

| 옵션 | 설명 |
|------|------|
| `--file <path>` | bundle 내부 파일 경로 |

### `eb bundle delete <workspace> <bundleId>`

bundle을 삭제합니다. 기본적으로 확인 프롬프트를 띄웁니다.

```bash
eb bundle delete ci-results pr-42-run-1
eb bundle delete ci-results pr-42-run-1 --force
```

---

## Workspace

### `eb workspace list`

워크스페이스 목록을 JSON으로 출력합니다.

```bash
eb workspace list
```

### `eb workspace create <slug> <name>`

워크스페이스를 생성합니다.

```bash
eb workspace create ci-results "CI Results" --description "Pull request evidence"
```

### `eb workspace update <slug>`

워크스페이스 이름이나 설명을 수정합니다. `--name` 또는 `--description` 중
하나는 필요합니다.

```bash
eb workspace update ci-results --name "CI Evidence"
eb workspace update ci-results --description "Nightly and PR runs"
```

### `eb workspace delete <slug>`

워크스페이스와 그 bundle을 삭제합니다. 기본적으로 확인 프롬프트를 띄웁니다.

```bash
eb workspace delete ci-results
eb workspace delete ci-results --force
```

---

## API key

### `eb api-key list`

현재 사용자 API key 목록을 JSON으로 출력합니다.

```bash
eb api-key list
```

Admin key로 모든 사용자의 key를 보려면 `--admin`을 사용합니다.

```bash
eb api-key list --admin
```

### `eb api-key create <name>`

API key를 생성합니다. scope는 `read`, `upload`, `admin` 중 하나입니다.

```bash
eb api-key create ci-uploader --scope upload
eb api-key create automation-admin --scope admin
```

응답에는 다시 볼 수 없는 원문 key와 저장된 record가 포함됩니다.

### `eb api-key delete <keyId>`

API key를 삭제합니다.

```bash
eb api-key delete key_123
```

---

## Bundle ID와 URL

`eb upload`에서 `--bundle-id`를 생략하면 서버는 업로드 파일명에서 `.zip`을
제외한 값을 bundle ID로 사용합니다. 계층형 ID를 쓰는 경우 viewer URL에서는
슬래시를 URL encoding해야 합니다.

```bash
eb upload report.zip --workspace ci-results --bundle-id "org/repo/pr-42/run-1"
```

---

## GitHub Actions 예시

```yaml
- name: Upload evidence bundle
  env:
    EB_URL: ${{ secrets.EVIDENCE_BROWSER_URL }}
    EB_API_KEY: ${{ secrets.EVIDENCE_BROWSER_API_KEY }}
  run: |
    eb bundle create .evidence/current --output dist/evidence.zip
    eb bundle validate dist/evidence.zip
    eb upload dist/evidence.zip \
      --workspace ci-results \
      --bundle-id "pr-${{ github.event.pull_request.number }}-run-${{ github.run_number }}"
```

---

## curl 대비

```bash
curl -X POST "$EB_URL/api/w/ci-results/bundle" \
  -H "Authorization: Bearer $EB_API_KEY" \
  -F "file=@report.zip" \
  -F "bundleId=pr-42-run-1"
```

동일한 업로드를 CLI로 실행하면 다음과 같습니다.

```bash
eb upload report.zip --workspace ci-results --bundle-id pr-42-run-1
```

---

## 종료 코드

현재 구현은 실패 시 `stderr`에 오류를 출력하고 `1`로 종료합니다. 성공 시
`0`으로 종료합니다.
