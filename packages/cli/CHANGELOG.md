# evidence-browser-cli

## 0.2.0

### Minor Changes

- 327c36e: 0.1.3 이후 누적된 CLI 변경분을 릴리즈합니다.

  - `eb bundle create` / `eb bundle validate` 로컬 번들 생성·검증 명령 추가
  - 공개 번들 공유 링크(share link) 지원
  - API 오류를 typed `ApiError` 로 통일하고 종료 코드 처리를 일원화
  - `eb workspace` 가 slug 기준으로 워크스페이스를 patch 하도록 수정
  - 명령 출력 헬퍼 정리 및 vendored shared 계약 동기화

## 0.1.3

### Patch Changes

- dbe75b1: Fix `eb upload` view URL to include the `/b/` segment so the printed link actually opens the bundle page, and accept snake_case `bundle_id` in the upload response for compatibility with newer API versions.

## 0.1.2

### Patch Changes

- efa41e2: eb login / logout / whoami 명령 추가

## 0.1.1

### Patch Changes

- bb230dd: many changes
- 463a041: patch
