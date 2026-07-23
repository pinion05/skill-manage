# Skill Atlas — Design Document

> Variant 디자인(6d3d60fc) 기반 CRT 터미널 코어 시스템 미학 적용.
> 완전 흑 배경 + 그린 모노스페이스 + CRT 오버레이 + 글리치/블링크 효과.

---

## 1. 디자인 철학

**CRT 터미널 코어 시스템 모니터.** 구식 모니터의 인광체 그린 번인, 스캔라인, 서브픽셀
RGB 패턴, 블링크 커서를 재현한 사이버펑크 터미널 인터페이스.

Skill Atlas의 각 섹션을 이 미학에 매핑한다:
- 헤더 → 시스템 정보 바 (CPU/MEM/UPTIME/ONLINE)
- 탭 → `[F1] OVERVIEW` 기능 키 네비게이션
- 통계 → `stat-box` 메트릭 (라벨/값/바)
- 그리드 → 로그 패널 `[timestamp] LEVEL message`
- 상세 → ASCII 아트 프레임 + 데이터

---

## 2. 컬러 토큰

소스 디자인에서 직접 추출한 정확한 값.

```css
:root {
  --bg: #000000;          /* 완전 흑 — CRT 꺼진 화면 */
  --green: #00FF66;       /* 인광체 그린 — 본문/액센트 */
  --green-dim: #003314;   /* 디 그린 — 보더/비활성 */
  --white: #e0e0e0;       /* 값/강조 텍스트 */
  --magenta: #FF00FF;     /* 레벨 표시 (ERR/OK/INF) */
  --blue: #0066FF;        /* 서브픽셀/링크 */
  --font: 'IBM Plex Mono', monospace;
  --subpixel-r: rgba(255, 0, 0, 0.4);
  --subpixel-g: rgba(0, 255, 0, 0.4);
  --subpixel-b: rgba(0, 0, 255, 0.4);
}
```

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#000000` | 모든 배경 |
| `--green` | `#00FF66` | 본문, 액센트, 보더, 바 |
| `--green-dim` | `#003314` | 비활성 보더, 디메뉴, 스크롤바 |
| `--white` | `#e0e0e0` | 값, 강조 텍스트 |
| `--magenta` | `#FF00FF` | 로그 레벨 (ERR/OK/INF) |
| `--blue` | `#0066FF` | 링크/서브픽셀 |

라이트 모드는 제공하지 않는다 — 이 디자인은 다크 전용.

---

## 3. 글로벌 베이스

```css
body, html {
  background: var(--bg);
  color: var(--green);
  font-family: var(--font);          /* IBM Plex Mono */
  font-size: 11px;                   /* 기본 11px — 고밀도 */
  text-transform: uppercase;         /* 전체 대문자 */
  letter-spacing: 0.05em;
}
```

원칙:
- **모든 텍스트 모노스페이스, 대문자, 11px 기준**
- 위계는 폰트 사이즈(9px 라벨 / 18px 값)와 opacity로
- `text-shadow: 0 0 5px var(--green)` 로 CRT 글로우 (값/제목에만)

---

## 4. CRT 효과 레이어

화면 전체에 오버레이하는 두 레이어:

### 4.1 스캔라인 + 서브픽셀 (`.crt-overlay`)
```css
.crt-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1000;
  background:
    linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.1) 50%),  /* 수평 스캔라인 */
    linear-gradient(90deg, var(--subpixel-r), var(--subpixel-g), var(--subpixel-b)); /* RGB 서브픽셀 */
  background-size: 100% 2px, 3px 100%;
  opacity: 0.15;
}
```

### 4.2 플리커 (`.crt-flicker`)
```css
.crt-flicker {
  position: fixed;
  inset: 0;
  background: rgba(18, 16, 16, 0.1);
  opacity: 0;
  z-index: 1001;
  pointer-events: none;
  animation: flicker 0.15s infinite;
}
@keyframes flicker {
  0% { opacity: 0.1; }
  50% { opacity: 0.02; }
  100% { opacity: 0.1; }
}
```

> `prefers-reduced-motion` 시 flicker/crt-overlay 비활성화.

---

## 5. 레이아웃

3컬럼 그리드 + 헤더/푸터:

```
┌─ HEADER (시스템 정보) ────────────────────────────┐
│ TERMINAL_CORE // SKILL_ATLAS    CPU 14% MEM 2.4G  │
├──────────┬───────────────────────────┬────────────┤
│  NAV     │  MAIN                      │  LOGS     │
│ (탭)     │  (그리드 + 통계)           │ (상세/    │
│          │                            │  액션)    │
│ 240px    │  1fr                       │  320px    │
├──────────┴───────────────────────────┴────────────┤
│ FOOTER (키 힌트: [F1] skills [F2] agents ...)     │
└────────────────────────────────────────────────────┘
```

```css
.dashboard {
  display: grid;
  grid-template-columns: 240px 1fr 320px;
  grid-template-rows: 40px 1fr 30px;
  height: 100vh;
  border: 1px solid var(--green-dim);
  padding: 8px;
  gap: 8px;
}
```

---

## 6. 컴포넌트 매핑

### 6.1 헤더 — 시스템 정보 바
```
TERMINAL_CORE // SKILL_ATLAS          SKILLS: 334 ● ONLINE
```
- `.glitch-text`: 제목에 글리치 효과 (`::after` 마젠타 섀도 + clip 애니메이션)
- `.sys-info`: 우측 메트릭 — 값은 `--white`, 라벨은 `--green opacity:0.8`
- `.blink`: `● ONLINE` 커서 (1s step-end blink)

### 6.2 네비게이션 — 기능 키 탭
현재 탭 바를 좌측 네비게이션으로 변환:
```
[F1] SKILLS      334  ← active (좌측 4px 그린 바)
[F2] AGENTS      274
[F3] PROJECTS     60
[F4] DUPLICATES   15
[F5] LINKS      191
[F6] SOURCES      27
```
- `.nav-item`: `padding: 8px 12px`, `justify-content: space-between`
- 호버: `background: var(--green); color: var(--bg)` (반전)
- 활성: `border-left: 4px solid var(--green); background: var(--green-dim)`

### 6.3 메인 — 통계 박스 + 그리드
상단: 통계 메트릭 3컬럼 그리드
```
┌─ SKILL_DEFINITIONS ─┐ ┌─ UNIQUE_NAMES ─┐ ┌─ CONFIG_ROOTS ─┐
│ 334                  │ │ 280             │ │ 12              │
│ ████████████░░░░     │ │ ██████████░░    │ │ ███░░░░░░       │
└──────────────────────┘ └─────────────────┘ └────────────────┘
```
- `.stat-box`: `border: 1px solid var(--green-dim); padding: 12px`
- `.stat-label`: `9px; opacity: 0.6`
- `.stat-value`: `18px; font-weight: bold; color: var(--white)`
- `.stat-bar`: 4px 높이, `--green-dim` 트랙, `--green` 필터 (`box-shadow: 0 0 10px var(--green)`)

하단: AG Grid (로그 패널 스타일)
- 행을 로그 엔트리처럼: `[timestamp] LEVEL message` 패턴은 아니지만, 행 보더를 `rgba(0,255,102,0.05)` 로
- 호버: `rgba(0,255,102,0.05)` 배경
- 헤더: 9px, opacity 0.6, uppercase

### 6.4 우측 패널 — 로그/상세
```
┌─ LOGS / DETAIL ──────────┐
│ [16:03:16] INF add-gmail │
│ [16:03:14] OK  scan done │
│ [16:03:12] ERR link brok │
└──────────────────────────┘
```
- `.logs-panel`: `border: 1px solid var(--green-dim); padding: 10px; font-size: 10px; background: rgba(0,255,102,0.02)`
- `.log-entry .ts`: `--green-dim` (타임스탬프)
- `.log-entry .lvl`: `--magenta; font-weight: bold` (레벨)
- `.log-entry .msg`: `--white` (메시지)

상세 패널도 같은 스타일 — KEY → VALUE 매핑이 로그 엔트리처럼 표시.

### 6.5 푸터 — 키 힌트
```
[F1] SKILLS  [F2] AGENTS  [F3] PROJECTS  [DEL] DELETE  [R] RESCAN
```
- `.key-hint span`: `background: var(--green); color: var(--bg); padding: 0 4px; font-weight: bold`

---

## 7. 스크롤바

얇은 CRT 스타일:
```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--green-dim); }
::-webkit-scrollbar-thumb:hover { background: var(--green); }
```

---

## 8. 애니메이션

| 액션 | 효과 | 지속 |
|---|---|---|
| CRT 플리커 | opacity 깜빡임 | 0.15s infinite |
| 블링크 커서 | opacity step-end | 1s infinite |
| 글리치 텍스트 | clip rect 애니메이션 + 마젠타 섀도 | 2s infinite alternate |
| 진행 바 (stat-fill) | box-shadow 글로우 | 정적 |
| 네비 호버 | 배경 반전 | 0.2s |
| 패널 슬라이드 | translateX | 180ms |

`prefers-reduced-motion`: flicker, glitch, blink 전부 비활성화. CRT 오버레이는 유지 (정적).

---

## 9. Skill Atlas 맵핑 요약

| 현재 컴포넌트 | 디자인 매핑 |
|---|---|
| `header.app-header` | `header` + `.glitch-text` + `.sys-info` |
| `.view-tabs` | `nav` + `.nav-item` (기능 키 스타일, 좌측 사이드바) |
| `.filter-workbench` | 메인 상단 인라인 필터 (그린 보더 input) |
| `StatsStrip` | `.stats-grid` + `.stat-box` (라벨/값/바) |
| AG Grid `.skill-grid` | `.logs-panel` 스타일 (그린 디 보더, 호버) |
| `SkillDetail` | `.logs-panel` — KEY → VALUE 로그 엔트리 |
| `.scan-rail` | 상단 2px — 유지하되 `--green` 글로우 |
| 빈 상태 | `→ NO MATCHES FOUND` 로그 스타일 |
| 삭제 다이얼로그 | `[CONFIRM] DELETE skill-name? (Y/N)` 터미널 프롬프트 |

---

## 10. 구현 순서

1. **글로벌 토큰 + 베이스** — `:root` 변수 교체, body 글로벌 (검정/그린/모노/대문자)
2. **CRT 오버레이** — `.crt-overlay` + `.crt-flicker` 최상위 추가
3. **레이아웃 전환** — 3컬럼 그리드 (좌측 nav / 메인 / 우측 패널)
4. **네비게이션** — 탭 바를 좌측 사이드바 기능 키 스타일로
5. **통계 박스** — StatsStrip을 stat-box 그리드로
6. **그리드 스킨** — AG Grid 테마를 그린 CRT로
7. **상세 패널** — 로그 엔트리 스타일
8. **효과** — 글리치 헤더, 블링크, 스크롤바
9. **푸터** — 키 힌트 바

각 단계는 별도 커밋으로 분리.
