---
"evidence-browser-cli": minor
---

0.1.3 이후 누적된 CLI 변경분을 릴리즈합니다.

- `eb bundle create` / `eb bundle validate` 로컬 번들 생성·검증 명령 추가
- 공개 번들 공유 링크(share link) 지원
- API 오류를 typed `ApiError` 로 통일하고 종료 코드 처리를 일원화
- `eb workspace` 가 slug 기준으로 워크스페이스를 patch 하도록 수정
- 명령 출력 헬퍼 정리 및 vendored shared 계약 동기화
