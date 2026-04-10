# Evidence Browser CLI (`eb`) — 스펙

> 상태: 설계 단계. 구현 전 확정 필요.

## 개요

`eb`는 Evidence Browser 서버와 통신하는 커맨드라인 도구입니다.
번들 업로드, 목록 조회, 로컬 검증을 지원합니다. CI 파이프라인과 AI 에이전트를 주요 사용 대상으로 설계합니다.

서버 내부에 직접 접근하지 않고 REST API만 사용합니다.

---

## 설치

```bash
npm install -g @evidence-browser/cli
# 또는
pnpm add -g @evidence-browser/cli
```

---

## 설정

### 인증 정보 저장 위치

```
~/.config/evidence-browser/config.json
```

```json
{
  "server": "https://evidence.example.com",
  "session": "<signed-session-cookie-value>"
}
```

### 우선순위 (높은 것이 이김)

1. 플래그 (`--server`, `--token`)
2. 환경변수 (`EB_SERVER`, `EB_TOKEN`)
3. `config.json`

### 환경변수

| 변수 | 설명 |
|------|------|
| `EB_SERVER` | 서버 URL (`https://evidence.example.com`) |
| `EB_TOKEN` | 세션 쿠키 값 (CI 환경에서 사용) |

---

## 커맨드 레퍼런스

### `eb login`

서버에 로그인하고 세션을 `config.json`에 저장합니다.

```
eb login [url]
```

| 인수 | 설명 |
|------|------|
| `url` | 서버 URL (생략 시 기존 설정 사용) |

```bash
eb login https://evidence.example.com
# Username: admin
# Password: ****
# 로그인 성공 (admin)
```

---

### `eb logout`

저장된 세션을 삭제합니다.

```
eb logout
```

---

### `eb whoami`

현재 로그인된 계정 정보를 출력합니다.

```
eb whoami
```

```
서버:     https://evidence.example.com
사용자:   admin (admin)
```

---

### `eb bundle upload`

ZIP 번들을 서버에 업로드합니다. admin 권한 필요.

```
eb bundle upload <file> --workspace <slug> [options]
```

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--workspace`, `-w` | 워크스페이스 slug (필수) | — |
| `--id` | 번들 ID (생략 시 파일명에서 추출) | `{filename without .zip}` |
| `--server` | 서버 URL 오버라이드 | config.json |

```bash
eb bundle upload report.zip --workspace ci-results

eb bundle upload report.zip \
  --workspace ci-results \
  --id "pr-42/run-1"

# CI 환경 (환경변수 사용)
EB_SERVER=https://evidence.example.com \
EB_TOKEN=$SESSION_COOKIE \
eb bundle upload dist/report.zip --workspace nightly
```

**번들 ID 규칙:**
- `/`로 계층 구조 표현 가능 (`pr-42/run-1`)
- `..`, 공백, `\0` 불가

---

### `eb bundle validate`

서버 없이 로컬에서 번들의 유효성을 검증합니다.

```
eb bundle validate <file>
```

```bash
eb bundle validate report.zip
# ✓ manifest.json 파싱 성공
# ✓ 필수 필드 확인 (version, title, index)
# ✓ index 파일 존재 확인 (index.md)
# 검증 통과
```

실패 예시:

```bash
eb bundle validate broken.zip
# ✗ manifest.json을 찾을 수 없습니다
# 종료 코드: 1
```

검증 항목:
- `manifest.json` 존재 여부
- JSON 파싱 가능 여부
- `version` (number), `title` (string), `index` (string) 필드 존재
- `index`가 가리키는 파일이 ZIP 내에 존재

> 이 커맨드는 서버 연결 없이 동작합니다. CI에서 업로드 전 사전 검증에 사용하세요.

---

### `eb bundle create`

디렉터리를 번들 ZIP으로 패키징합니다.

```
eb bundle create <dir> [options]
```

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--output`, `-o` | 출력 파일 경로 | `{dir-name}.zip` |
| `--title` | `manifest.json`의 title | 디렉터리 이름 |
| `--index` | `manifest.json`의 index | `index.md` |

```bash
# 기본 사용
eb bundle create ./report

# 옵션 지정
eb bundle create ./report \
  --output dist/pr-42.zip \
  --title "PR #42 테스트 결과" \
  --index report.md
```

이미 `manifest.json`이 디렉터리 안에 있으면 그대로 사용하고 플래그를 무시합니다.

---

### `eb bundle list`

워크스페이스의 번들 목록을 출력합니다.

```
eb bundle list --workspace <slug> [options]
```

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--workspace`, `-w` | 워크스페이스 slug (필수) | — |
| `--json` | JSON 형식으로 출력 | false |

```bash
eb bundle list --workspace ci-results

# BUNDLE ID              TITLE                  UPLOADED
# pr-42/run-1            PR #42 테스트 결과      2026-04-10 14:32
# pr-41/run-2            PR #41 재실행           2026-04-09 11:20
```

---

### `eb workspace list`

워크스페이스 목록을 출력합니다.

```
eb workspace list [options]
```

| 플래그 | 설명 |
|--------|------|
| `--json` | JSON 형식으로 출력 |

```bash
eb workspace list

# SLUG          NAME              BUNDLES
# ci-results    CI 결과            24
# nightly       야간 빌드           7
```

---

### `eb user list` _(admin)_

사용자 목록을 출력합니다. admin 권한 필요.

```
eb user list
```

---

### `eb user create` _(admin)_

사용자를 생성합니다. admin 권한 필요.

```
eb user create <username> [options]
```

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--role` | `admin` 또는 `user` | `user` |
| `--password` | 비밀번호 (생략 시 프롬프트) | — |

```bash
eb user create alice --role user
eb user create bob --role admin --password hunter2
```

---

## 종료 코드

| 코드 | 의미 |
|------|------|
| `0` | 성공 |
| `1` | 일반 오류 (검증 실패, 파일 없음 등) |
| `2` | 인증 오류 (미로그인, 권한 없음) |
| `3` | 서버 연결 오류 |

---

## CI 사용 예시

### GitHub Actions

```yaml
- name: Upload evidence bundle
  env:
    EB_SERVER: ${{ secrets.EVIDENCE_SERVER_URL }}
    EB_TOKEN: ${{ secrets.EVIDENCE_SESSION_TOKEN }}
  run: |
    eb bundle validate dist/report.zip
    eb bundle upload dist/report.zip \
      --workspace ci-results \
      --id "pr-${{ github.event.pull_request.number }}/run-${{ github.run_number }}"
```

### curl 대비 장점

```bash
# 기존 방식
curl -X POST $SERVER/api/w/ci-results/bundle \
  -b "evidence_session=$TOKEN" \
  -F "file=@report.zip" \
  -F "bundleId=pr-42/run-1"

# eb 사용
eb bundle upload report.zip \
  --workspace ci-results \
  --id pr-42/run-1
```

---

## 미결 사항

- [ ] 세션 쿠키 외 API 키 인증 방식 지원 여부 (현재 서버에 API 키 엔드포인트 없음)
- [ ] `eb bundle delete` 커맨드 필요 여부
- [ ] 번들 ID 중복 시 동작: 오류 vs 덮어쓰기 (`--overwrite` 플래그?)
- [ ] `eb bundle create` 에서 `.ebignore` 지원 여부
- [ ] 패키지명: `@evidence-browser/cli` vs `eb` vs 다른 이름
