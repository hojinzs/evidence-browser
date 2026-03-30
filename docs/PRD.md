# PRD — Evidence Browser v0

## 1. 개요

Evidence Browser는 에이전트가 생성한 실행 결과 번들(bundle)을 인증된 환경에서 안전하게 열어볼 수 있게 하는 경량 브라우저다.
이 제품의 목적은 테스트 실행 자체가 아니라, 업로드된 evidence bundle을 사람이 쉽게 검토하고 탐색하게 만드는 것이다.

핵심은 두 가지다.
1. public HTML/이미지 노출 없이 인증된 사용자만 evidence를 볼 수 있어야 한다.
2. 많은 evidence 파일을 VS Code와 비슷한 파일 브라우징 경험으로 쉽게 탐색할 수 있어야 한다.

이 제품은 업로드 파이프라인이나 PR 코멘트 자동화 자체를 포함하지 않는다.
대신, 에이전트가 업로드한 bundle의 최소 형식을 정의하고 이를 탐색 가능한 UI로 제공하는 viewer 역할에 집중한다.

---

## 2. 문제 정의

현재 AI 에이전트가 테스트 또는 명령 수행 후 로그, 스크린샷, 스크립트 등의 evidence를 첨부해 결과를 남기고 있다.
하지만 evidence가 많아질수록 단일 HTML 리포트 URL로는 전체 내용을 탐색하고 검증하기 어렵다.

기존 방식의 문제는 다음과 같다.
- HTML과 이미지가 public 스토리지에 올라가 누구나 접근 가능한 경우가 있다.
- evidence 수가 많을수록 사람 입장에서 탐색성이 크게 떨어진다.
- 요약과 실제 근거 파일 사이를 오가기 어렵다.
- 모바일에서도 읽고 확인할 수 있는 인터페이스가 부족하다.

---

## 3. 목표

### 제품 목표
- 인증된 사용자만 evidence bundle을 볼 수 있게 한다.
- bundle 내부의 파일을 트리 형태로 쉽게 탐색할 수 있게 한다.
- 첫 화면에서 요약 문서를 읽고, 그 안의 링크를 통해 관련 파일로 바로 이동할 수 있게 한다.
- DB 없이 동작 가능한 단순한 구조를 유지한다.
- 폴더 구조를 강하게 강제하지 않고, 최소한의 규약만 요구한다.

### 비목표
- 테스트 실행
- 에이전트 orchestration
- 업로드 자동화
- PR 코멘트 자동 작성
- 결과 집계/통계 대시보드
- 실행 이력 DB 관리

---

## 4. 핵심 시나리오

### 시나리오 1
사용자가 Vercel 또는 self-hosted 환경에 Evidence Browser를 설치한다.
OIDC 기반 인증 규칙을 설정한다.

### 시나리오 2
에이전트는 테스트나 명령 수행 후 manifest.json, index.md, 그리고 관련 로그/스크린샷/스크립트 파일을 함께 묶어 zip bundle로 스토리지(R2, S3 등)에 업로드한다.

### 시나리오 3
에이전트는 규칙에 따라 업로드된 bundle URL 또는 Evidence Browser용 viewer URL을 PR 코멘트에 남긴다.

### 시나리오 4
사용자는 PR 코멘트에 있는 링크를 클릭한다.

### 시나리오 5
사용자는 Evidence Browser에서 다음을 수행한다.
- index.md 기반 요약을 읽는다.
- 파일 트리를 탐색한다.
- 요약 내 링크를 클릭해 특정 파일을 바로 연다.
- 필요 시 원본 파일을 계속 탐색한다.

---

## 5. 사용자 스토리

### US-01
검토자로서, 인증된 상태에서 evidence bundle을 열고 싶다.
그래야 외부 공개 없이 결과를 확인할 수 있다.

### US-02
검토자로서, bundle을 열었을 때 요약 문서를 먼저 보고 싶다.
그래야 전체 결과를 빠르게 이해할 수 있다.

### US-03
검토자로서, VS Code와 비슷한 파일 트리로 evidence 파일을 탐색하고 싶다.
그래야 많은 첨부 파일도 쉽게 확인할 수 있다.

### US-04
검토자로서, 요약 문서 안의 링크를 눌러 관련 파일로 바로 이동하고 싶다.
그래야 요약과 근거를 빠르게 오가며 검증할 수 있다.

### US-05
생성자로서, 강한 폴더 구조 강제 없이 evidence를 bundle로 올리고 싶다.
그래야 다양한 에이전트 결과를 같은 브라우저에서 볼 수 있다.

---

## 6. 제품 범위

### 포함
- OIDC 인증 뒤에서 동작하는 viewer
- zip bundle 읽기
- manifest.json 해석
- index.md 렌더링
- 파일 트리 탐색
- 이미지/텍스트/마크다운/코드 파일 뷰
- Markdown 내부 링크를 통한 deep navigation

### 제외
- 업로드 파이프라인 구현
- PR 코멘트 작성 로직
- DB 저장
- 검색/집계
- 실행 이력 관리
- 테스트 도메인 특화 모델(TC, step, result 등)의 강제

---

## 7. 정보 구조

이 제품은 bundle 단위로 동작한다.

### 필수 파일
- manifest.json
- index.md

### 선택 파일
- 로그 파일
- 이미지 파일
- 스크립트 파일
- JSON/텍스트 파일
- 기타 evidence 파일

### bundle 규칙
- bundle root에 manifest.json 이 있어야 한다.
- bundle root에 index.md 가 있어야 한다.
- 나머지 폴더 구조는 자유다.

예시:
```text
bundle.zip
├─ manifest.json
├─ index.md
├─ logs/
├─ screenshots/
├─ scripts/
└─ anything-else/
```

---

## 8. manifest 규칙

manifest.json 은 viewer가 bundle을 여는 데 필요한 최소 정보만 가진다.
초기 버전에서는 매우 얇게 유지한다.

### v0 예시
```json
{
  "version": 1,
  "title": "PR #182 evidence",
  "index": "index.md"
}
```

### 필수 필드
- version
- title
- index

### 원칙
- domain-specific metadata는 가급적 넣지 않는다.
- viewer index 역할만 한다.
- 요약 정보는 index.md 에 둔다.

---

## 9. Markdown 형식 규칙

이 제품은 index.md 를 첫 화면 문서로 사용한다.
따라서 중요한 것은 복잡한 custom syntax가 아니라, 어떤 Markdown 형식을 표준으로 쓸지 정하는 것이다.

### 채택 규칙
- CommonMark 기반
- GitHub Flavored Markdown 일부 지원
- 지원 범위: heading, paragraph, list, blockquote, fenced code block, inline code, table, link, image, thematic break, task list, strikethrough
- raw HTML은 허용하지 않거나 sanitize한다

### 링크 규칙
- `https://...` 형태는 외부 링크
- 상대경로 링크는 bundle 내부 파일 링크
- `#anchor` 는 현재 문서 내부 anchor
- 필요 시 `path#L10-L20` 같은 라인 deep link를 추후 확장 가능하나 v0 필수는 아님

### 이미지 규칙
- `![alt](path)` 는 문서 내 인라인 렌더링
- 상대경로 이미지는 bundle 내부 asset으로 해석

### 설계 원칙
- custom markdown directive는 v0에서 도입하지 않는다
- 순수 Markdown만으로 충분히 작성 가능해야 한다
- viewer는 Markdown를 잘 렌더링하고 내부 링크를 정확히 연결하는 데 집중한다

---

## 10. 주요 화면

### 1. Bundle Landing View
- 제목
- index.md 렌더링 결과
- 좌측 또는 보조 영역에 파일 트리
- 클릭 시 파일 열기

### 2. File Tree View
- VS Code 유사 파일 트리
- 폴더 접기/펼치기
- 현재 열린 파일 하이라이트

### 3. File Viewer

파일 타입에 따라 다른 방식으로 표시한다.
- Markdown: 렌더링 뷰
- 이미지: 이미지 뷰어
- 텍스트/로그/JSON/스크립트: 코드 뷰어
- 미지원 파일: 다운로드 또는 raw view

---

## 11. 기능 요구사항

### 필수
- OIDC 인증 지원
- zip bundle 로드
- manifest.json 검증
- index.md 렌더링
- 파일 트리 표시
- 내부 링크 클릭 시 해당 파일 열기
- 이미지 렌더링
- 텍스트/코드 파일 보기
- 모바일에서도 기본 탐색 가능

### 선택
- syntax highlight
- line number 표시
- 파일 검색
- 최근 열람 파일
- deep link 공유

---

## 12. 비기능 요구사항

### 보안
- 인증되지 않은 사용자는 bundle에 접근할 수 없어야 한다
- raw HTML/script/iframe 등 위험한 콘텐츠는 차단되어야 한다
- bundle root 밖의 파일 접근은 허용하지 않아야 한다

### 단순성
- DB 없이 동작해야 한다
- 서버 상태 저장을 최소화해야 한다
- 배포 구조가 단순해야 한다

### 확장성
- 다양한 에이전트와 파일 구조를 수용할 수 있어야 한다
- manifest는 얇게 유지하고, bundle 내부 파일 구조는 자유로워야 한다

---

## 13. 성공 기준

### MVP 성공 기준
- 사용자가 인증 후 bundle을 열 수 있다
- 첫 화면에서 index.md 요약을 읽을 수 있다
- 파일 트리로 evidence를 탐색할 수 있다
- 요약의 링크를 눌러 해당 파일로 이동할 수 있다
- public HTML 업로드 없이 기존 리포트 검토 문제를 대체할 수 있다

### 정성 지표
- 리뷰어가 "HTML 리포트보다 evidence 확인이 쉽다"고 느낀다
- 요약과 근거 파일 사이 이동이 자연스럽다
- 모바일에서도 최소한의 검토가 가능하다

---

## 14. 오픈 질문
- bundle은 viewer가 직접 zip을 스트리밍해서 읽을지, 서버에서 임시 해제할지
- 대용량 bundle 처리 기준은 어떻게 둘지
- line deep link를 v0에 포함할지, v1로 미룰지
- viewer URL 규칙을 어떻게 단순화할지
- 외부 스토리지 signed URL과 인증 viewer를 어떻게 조합할지
