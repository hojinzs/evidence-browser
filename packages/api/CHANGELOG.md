# @evidence-browser/api

## 0.2.1

### Patch Changes

- f27d3fa: Add OIDC start/callback authentication routes, identity resolution, and the local-login off switch for issue #166.
- c9b7e42: Verify Evidence Browser OIDC login against a containerized Dex provider for issue #168, and update generated auth guidance to describe optional OIDC SSO alongside local sessions and API keys.
- d6b2727: Harden OIDC verification for issue #164 by asserting failed callbacks clear the signed transaction cookie and documenting the Authentik/Dex sign-off path.
  - @evidence-browser/shared@0.2.1

## 0.2.0

### Minor Changes

- 327c36e: 마지막 이미지 릴리즈(2026-05-25) 이후 누적된 앱 변경분을 릴리즈합니다.

  - MCP: API 키 스코프 적용, 서명된 업로드 URL 발급
  - API: SQLite 마이그레이션 러너 도입, 런타임 라이프사이클 강화, 런타임 상수·인증 스코프 처리 일원화
  - 보안: 번들 조회를 DB 경유로 제한, ZIP 검증 입력 크기 제한, 빈 번들 ID 거부, markdown src 허용 목록 복구
  - Web: SPA 에러 폴백 추가, 번들 업로드 API 통합, 파일 트리 props 정리
  - 빌드: 내부 `@evidence-browser/shared` 의존성을 `file:` 대신 semver 레인지로 표기

### Patch Changes

- Updated dependencies [327c36e]
  - @evidence-browser/shared@0.2.0
