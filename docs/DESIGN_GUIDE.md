# Design Guide: Evidence Browser

Vercel-style professional SaaS 디자인 시스템

---

## Figma 참조

**파일**: `https://www.figma.com/design/1okB3xycCchoKGB18tvGT7`

### 페이지 구조

| 페이지 | 역할 |
|--------|------|
| `🎨 Design System` | 색상 팔레트 + 타이포그래피 문서화 |
| `🧩 Components` | Button, Badge, Input, Card, Sidebar Nav Item |
| `📱 Screens` | Login / Home / Workspace / Bundle Viewer / Admin |

### Figma 변수 ↔ CSS 변수 매핑

Figma 요소를 inspect할 때 나오는 변수명과 코드의 CSS 변수명이 다릅니다. 아래 표로 대조하세요.

| Figma 변수 | CSS 변수 | 다크 값 | 용도 |
|-----------|---------|--------|------|
| `Background/Base` | `--background` | `oklch(0.06 0 0)` | 페이지 최하단 배경 |
| `Background/Card` | `--card` | `oklch(0.115 0 0)` | 카드, 컨테이너 |
| `Background/Elevated` | (인라인) | `oklch(0.15 0 0)` | hover, 중첩 카드 |
| `Background/Sidebar` | `--sidebar` | `oklch(0.09 0 0)` | 사이드바 배경 |
| `Background/Secondary` | `--secondary` | `oklch(0.18 0 0)` | secondary 버튼 bg |
| `Background/Hover` | (인라인) | `oklch(0.14 0 0)` | hover state bg |
| `Text/Primary` | `--foreground` | `oklch(0.985 0 0)` | 주요 텍스트 |
| `Text/Secondary` | `--muted-foreground` | `oklch(0.71 0 0)` | 보조 텍스트 |
| `Text/Tertiary` | (인라인) | `oklch(0.55 0 0)` | caption, placeholder |
| `Border/Default` | `--border` | `oklch(1 0 0 / 8%)` | 기본 경계선 |
| `Border/Hover` | (인라인) | `oklch(1 0 0 / 16%)` | hover 경계선 |
| `Border/Focus` | `--primary` | `oklch(0.585 0.21 256)` | focus 경계선 |
| `Accent/Blue` | `--primary` | `oklch(0.585 0.21 256)` | CTA, 링크 |
| `Accent/Red` | `--destructive` | `oklch(0.62 0.22 25)` | 에러, 삭제 |
| `Accent/Green` | `--success` | `oklch(0.72 0.19 145)` | 성공, 완료 |
| `Accent/Amber` | `--warning` | `oklch(0.85 0.17 85)` | 경고 |
| `Effect/Ring-Blue` | `--ring` | `oklch(0.585 0.21 256 / 50%)` | focus ring |

> **주의**: Figma 화면의 대부분 요소는 변수 바인딩 없이 하드코딩된 색상으로 구성되어 있습니다.
> Figma inspect 값이 위 표와 일치하면 해당 CSS 변수를 사용하세요. 코드 작성 시에는 CSS 변수명을 직접 참조하는 것이 기준입니다.

### Figma에서 표현되지 않는 동작

Figma는 정적 스냅샷입니다. 아래 항목은 구현 시 반드시 추가해야 합니다.

| 항목 | 구현 스펙 |
|------|----------|
| Header 배경 | `bg-background/80 backdrop-blur-md` |
| 모든 인터랙티브 요소 | `transition-colors duration-150` |
| 카드/행 hover | `hover:border-[oklch(1_0_0/16%)] hover:bg-[oklch(0.14_0_0)]` |
| Input focus | `focus:border-primary focus:ring-3 focus:ring-ring` |
| 페이지 진입 | `fade-up 200ms ease` (애니메이션 섹션 참조) |

---

## 디자인 철학

### 핵심 원칙

1. **Dark-first** — 다크 모드가 primary experience
2. **Monochromatic Base + Single Accent** — 회색 스케일 기반에 Blue 하나만
3. **투명도 기반 경계선** — `rgba(255,255,255,0.08)` 수준의 얇고 섬세한 border
4. **Surface 계층구조** — 배경/카드/호버를 3단계로 구분
5. **150ms 원칙** — 모든 인터랙션 전환은 150ms ease

---

## 색상 시스템

### CSS 변수 (globals.css 기준)

```css
/* ============================
   Dark Mode (Primary)
   ============================ */
.dark {
  /* Backgrounds - 3단계 계층 */
  --background: oklch(0.06 0 0);        /* L0: #0a0a0a — 최하단 배경 */
  --card: oklch(0.115 0 0);             /* L1: #111 — 카드, 사이드바 */
  --popover: oklch(0.115 0 0);
  /* L2: oklch(0.15 0 0) — hover, 중첩 카드 (인라인 사용) */

  /* Text - 3단계 명도 */
  --foreground: oklch(0.985 0 0);       /* Primary: #fafafa */
  --card-foreground: oklch(0.985 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --muted-foreground: oklch(0.71 0 0);  /* Secondary: #aaa */
  /* Tertiary: oklch(0.55 0 0) — caption, placeholder (인라인 사용) */

  /* Borders - 투명도 기반 */
  --border: oklch(1 0 0 / 8%);          /* 기본: rgba(255,255,255,0.08) */
  --input: oklch(1 0 0 / 10%);
  --ring: oklch(0.585 0.21 256 / 50%);  /* Blue focus ring */

  /* Accent - Vercel Blue */
  --primary: oklch(0.585 0.21 256);     /* #0070f3 */
  --primary-foreground: oklch(1 0 0);

  /* Secondary / Muted */
  --secondary: oklch(0.18 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.15 0 0);
  --accent: oklch(0.18 0 0);
  --accent-foreground: oklch(0.985 0 0);

  /* Semantic */
  --destructive: oklch(0.62 0.22 25);   /* Red */
  --success: oklch(0.72 0.19 145);      /* Green */
  --warning: oklch(0.85 0.17 85);       /* Amber */

  /* Sidebar */
  --sidebar: oklch(0.09 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.585 0.21 256);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.15 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.585 0.21 256 / 50%);
}

/* ============================
   Light Mode (Secondary)
   ============================ */
:root {
  --background: oklch(1 0 0);
  --card: oklch(0.99 0 0);
  --popover: oklch(0.99 0 0);

  --foreground: oklch(0.09 0 0);
  --card-foreground: oklch(0.09 0 0);
  --popover-foreground: oklch(0.09 0 0);
  --muted-foreground: oklch(0.45 0 0);

  --border: oklch(0 0 0 / 8%);           /* rgba(0,0,0,0.08) */
  --input: oklch(0 0 0 / 8%);
  --ring: oklch(0.46 0.22 256 / 40%);

  --primary: oklch(0.46 0.22 256);       /* 라이트에선 더 진한 blue */
  --primary-foreground: oklch(1 0 0);

  --secondary: oklch(0.96 0 0);
  --secondary-foreground: oklch(0.09 0 0);
  --muted: oklch(0.97 0 0);
  --accent: oklch(0.96 0 0);
  --accent-foreground: oklch(0.09 0 0);

  --destructive: oklch(0.52 0.22 25);
  --success: oklch(0.55 0.19 145);
  --warning: oklch(0.65 0.17 85);

  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.09 0 0);
  --sidebar-primary: oklch(0.46 0.22 256);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.96 0 0);
  --sidebar-accent-foreground: oklch(0.09 0 0);
  --sidebar-border: oklch(0 0 0 / 8%);
  --sidebar-ring: oklch(0.46 0.22 256 / 40%);
}
```

### 색상 사용 원칙

| 목적 | 토큰 | 사용처 |
|------|------|--------|
| 주요 액션 | `--primary` | CTA 버튼, 링크, 체크박스 |
| 위험 액션 | `--destructive` | 삭제 버튼, 에러 상태 |
| 성공 | `--success` | 완료 상태, 업로드 성공 |
| 경고 | `--warning` | 주의 배지, 경고 메시지 |
| 비활성 텍스트 | `--muted-foreground` | placeholder, 레이블, 보조 정보 |
| 경계선 | `--border` | 모든 divider, card border |

---

## 타이포그래피

### 폰트 패밀리

```css
--font-sans: var(--font-geist-sans), var(--font-pretendard), sans-serif;
--font-mono: var(--font-geist-mono);
```

**구현**: `geist` 패키지 또는 `next/font`로 Geist를 로드하고, 한글은 Pretendard로 fallback합니다.

> **Figma 참고**: Figma 파일은 **Inter**를 사용합니다. Geist가 Figma 내에서 라이선스 제한으로 지원되지 않아 시각적으로 유사한 Inter로 대체된 것입니다. 실제 구현은 항상 **Geist + Pretendard**를 기준으로 하고, Figma의 폰트는 레이아웃 참조용으로만 활용하세요.

### 크기 계층

| 토큰 | 크기 | 용도 |
|------|------|------|
| `text-[11px]` | 11px | Badge, caption, 메타 정보 |
| `text-xs` | 12px | 보조 레이블 |
| `text-sm` | 13px | **기본 body** (Vercel 기준) |
| `text-base` | 14px | 일반 UI 텍스트 |
| `text-lg` | 16px | 섹션 제목 |
| `text-xl` | 20px | 페이지 제목 |
| `text-2xl` | 24px | Hero, 랜딩 |

> Vercel UI의 기본 body size는 **13px**. `text-sm`이 사실상 기본값.

### 굵기

- `font-medium` (500) — UI 레이블, 네비게이션
- `font-semibold` (600) — 제목, 강조
- `font-normal` (400) — body, 설명

---

## 간격 & 레이아웃

### 8px 그리드

모든 간격은 4px(0.25rem) 단위로, 실질적으로 8px 배수를 권장:

```
4px  — 아이콘 내부 gap
8px  — 인라인 요소 간격
12px — 컴포넌트 내부 패딩 (sm)
16px — 컴포넌트 패딩 (기본)
24px — 섹션 내부 간격
32px — 섹션 간 간격
48px — 페이지 영역 간격
```

### 레이아웃 구조

```
┌─────────────────────────────────────────┐
│  Header (h-12, sticky, backdrop-blur)   │
├──────────────┬──────────────────────────┤
│              │                          │
│  Sidebar     │   Main Content           │
│  w-60        │   flex-1                 │
│              │   p-6                    │
│              │                          │
└──────────────┴──────────────────────────┘
```

---

## Border & Radius 시스템

### Border Radius

```css
--radius: 0.5rem;   /* 8px — 기본. Vercel은 sharp함 */

/* 파생값 (자동 계산됨) */
--radius-sm: 0.3rem  /* 4.8px */
--radius-md: 0.4rem  /* 6.4px */
--radius-lg: 0.5rem  /* 8px */
--radius-xl: 0.7rem  /* 11.2px */
```

### Border 스타일

```css
/* 기본 경계선 */
border: 1px solid var(--border);  /* oklch(1 0 0 / 8%) */

/* hover 시 */
border-color: oklch(1 0 0 / 16%);  /* 2배 강도 */

/* focus / active 시 */
border-color: var(--primary);
box-shadow: 0 0 0 3px var(--ring);
```

---

## 컴포넌트 패턴

### Header

```tsx
// backdrop-filter blur + 반투명 배경
<header className="
  sticky top-0 z-50
  flex h-12 items-center
  border-b border-border
  bg-background/80 backdrop-blur-md
  px-4 gap-3
">
```

### Card

```tsx
// 투명도 기반 border + subtle hover
<div className="
  rounded-lg border border-border
  bg-card
  p-4
  transition-colors duration-150
  hover:border-[oklch(1_0_0/16%)]
  hover:bg-[oklch(0.14_0_0)]
">
```

### Button variants

| Variant | 스타일 |
|---------|--------|
| `default` | `bg-primary text-white hover:bg-primary/90` |
| `outline` | `border-border hover:border-[oklch(1_0_0/16%)] hover:bg-[oklch(1_0_0/4%)]` |
| `ghost` | `hover:bg-[oklch(1_0_0/6%)]` |
| `destructive` | `bg-destructive/10 text-destructive hover:bg-destructive/20` |
| `secondary` | `bg-secondary hover:bg-secondary/80` |

### Badge

```tsx
// 11px, rounded-full, 색상 10% 배경
<span className="
  inline-flex items-center
  rounded-full px-2 py-0.5
  text-[11px] font-medium
  bg-primary/10 text-primary        // blue
  bg-success/10 text-success        // green
  bg-destructive/10 text-destructive // red
  bg-[oklch(1_0_0/8%)] text-muted-foreground  // neutral
">
```

### Input

```tsx
<input className="
  w-full rounded-md
  border border-border
  bg-[oklch(0_0_0/30%)]  // 약간 투명
  px-3 py-1.5 text-sm
  placeholder:text-muted-foreground
  focus:border-primary
  focus:ring-3 focus:ring-ring
  transition-colors duration-150
">
```

### Sidebar Navigation Item

```tsx
// 비활성
<a className="
  flex items-center gap-2
  rounded-md px-2.5 py-1.5
  text-sm text-muted-foreground
  hover:bg-[oklch(1_0_0/6%)]
  hover:text-foreground
  transition-colors duration-150
">

// 활성
<a className="
  ... bg-[oklch(1_0_0/6%)] text-foreground font-medium
">
```

---

## 애니메이션

### 전환 원칙

```css
/* 기본 전환 (모든 인터랙티브 요소) */
transition-property: background-color, border-color, color, opacity;
transition-duration: 150ms;
transition-timing-function: ease;

/* 포커스 ring 전환 */
transition-property: box-shadow, border-color;
transition-duration: 100ms;
```

### 페이지 진입 애니메이션

```css
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-enter {
  animation: fade-up 200ms ease forwards;
}

/* 리스트 아이템 stagger */
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 30ms; }
.list-item:nth-child(3) { animation-delay: 60ms; }
/* ... */
```

### 사용 지침

- 레이아웃 변화(크기/위치)는 피할 것 — 성능 저하
- opacity + transform만 animate
- 250ms 초과 금지 — 느려 보임
- `prefers-reduced-motion` 미디어 쿼리 존중

---

## 아이콘

- **Lucide React** 유지 (현행)
- 기본 크기: `size-4` (16px)
- 버튼 내부: `size-3.5` (14px)
- 섹션 제목 옆: `size-4` (16px)
- 색상: 부모 색상 상속 (`currentColor`)

---

## 다크/라이트 모드 전환

- **시스템 기본값 따르기** (`prefers-color-scheme`)
- 헤더에 토글 버튼 제공 (옵션)
- 다크 모드가 primary — 라이트는 보조적 지원
- SSR 시 flicker 방지: `suppressHydrationWarning` + `next-themes` 사용 고려

---

## 구현 우선순위

| 순위 | 작업 | 예상 효과 |
|------|------|-----------|
| 1 | `globals.css` 색상 변수 교체 | 전체 색감 즉시 변화 |
| 2 | `--border` 투명도 기반으로 전환 | SaaS 느낌 핵심 |
| 3 | `--primary` Vercel Blue 적용 | 액션 컬러 생김 |
| 4 | Header `backdrop-blur` 추가 | 프리미엄 느낌 |
| 5 | Button/Card hover transition 추가 | 인터랙션 완성 |
| 6 | `--radius` 8px로 조정 | 기하학적 정밀함 |
| 7 | 페이지 진입 fade-up 애니메이션 | 완성도 향상 |
