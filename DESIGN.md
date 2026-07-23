# Skill Atlas — Design Document

> 다크 테마 + 터미널 미학 개선 설계. 이슈 #4(다크모드)와 연계하여 UI를 terminal-like
> 비주얼 언어로 통일한다.

---

## 1. 디자인 철학

Skill Atlas는 **개발자가 자신의 로컬 스킬 인벤토리를 검사하는 CLI 도구의 웹 표현**이다.
따라서 디자인도 그 출처를 드러내야 한다:

- **터미널에서 온 도구** — 모노스페이스 타이포, 좁은 줄 간격, 편평한 보더, 시그널 컬러
- **고밀도 데이터** — 불필요한 여백 최소화, 정보 위계는 색과 무게로
- **존재감 있는 다크** — 완전 흑(#000)이 아닌 짙은 슬레이트. 장시간 작업에 편한 대비
- **하나의 액센트** — 브랜드 액센트 하나로 인터랙션 신호. 다색 팔레트 지양

참고 레퍼런스: Warp, Ghostty, Alacritty, GitHub dark, Linear.

---

## 2. 컬러 토큰

### 현재 (라이트, `:root`)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--paper` | `#edf0f2` | 페이지 배경 |
| `--surface` | `#f8fafb` | 카드/패널 |
| `--ink` | `#152239` | 본문 텍스트 |
| `--muted` | `#667184` | 보조 텍스트 |
| `--line` | `#cbd2da` | 보더 |
| `--accent` | `#315acb` | 브랜드/링크 |
| `--danger` | `#b83b4a` | 삭제/에러 |

### 목표 (다크, `[data-theme="dark"]`)

터미널 팔레트: 짙은 슬레이트 배경 + 시안/그린 액센트. ANSI 16색에서 영감.

| 토큰 | 다크 값 | 라이트과의 대비 포인트 |
|---|---|---|
| `--paper` | `#0d1117` | GitHub dark 배경 (완전 흑 아님) |
| `--surface` | `#161b22` | 카드 한 단계 위 |
| `--surface-strong` | `#1c2128` | 패널/다이얼로그 |
| `--ink` | `#e6edf3` | 본문 — 높은 대비 |
| `--muted` | `#7d8590` | 보조 — 가독성 유지 |
| `--line` | `#30363d` | 보더 — 미세하지만 보임 |
| `--line-strong` | `#484f58` | 강조 보더 |
| `--accent` | `#58a6ff` | 시안-블루 (터미널 프롬프트 색) |
| `--accent-soft` | `rgba(88,166,255,0.12)` | 호버 배경 |
| `--danger` | `#f85149` | ANSI 레드 |
| `--danger-soft` | `rgba(248,81,73,0.12)` | |
| `--success` | `#3fb950` | ANSI 그린 |
| `--warning` | `#d29922` | ANSI 옐로우 |

> `prefers-color-scheme: dark` 미디어 쿼리로 시스템 자동 감지 + `data-theme` 속성으로 수동 오버라이드.

---

## 3. 타이포그래피

**단일 모노스페이스 패밀리로 통일.** 현재는 sans(Avenir Next)와 mono가 혼용되는데,
terminal-like 방향에서는 모노를 기본으로 한다.

```css
:root {
  --mono: "JetBrains Mono", "SF Mono", "Cascadia Code", "Roboto Mono", monospace;
  --sans: var(--mono);  /* 터미널 방향: sans도 mono로 통일 */
}
```

| 요소 | 크기 | 무게 | 행간 |
|---|---|---|---|
| 페이지 타이틀 (Skill Atlas) | `2rem` | 700 | 1 |
| 섹션 헤더 (h2) | `0.95rem` | 700 | 1.2 |
| 본문 텍스트 | `0.82rem` | 400 | 1.4 |
| 라벨/kicker | `0.62rem` | 700, uppercase, letter-spacing 0.12em | 1 |
| 코드/경로 | `0.72rem` | 400 | 1.3 |
| 그리드 행 | `0.8rem` | 400 | 1.35 |
| 그리드 헤더 | `0.62rem` | 700, uppercase | 1 |

원칙: **모든 텍스트가 모노스페이스.** 레터 스페이싱으로 위계 표현.

---

## 4. 레이아웃 원칙

- **플랫 보더** — `box-shadow` 최소화, 1px 솔리드 보더 + 미세한 컬러 차이로 깊이 표현
- **터미널 프롬프트 헤더** — 상단 헤더를 `$ skill-atlas --scan` 프롬프트 스타일로
- **밀집 그리드** — 행 높이 44px 유지, 행 간 보더만 (줄무늬 배경 없음)
- **상태 표시줄** — 하단 또는 헤더에 `● 334 skills · 191 links · 15 duplicates` 터미널 상태줄
- **패널 슬라이드** — 상세 패널은 오른쪽에서 슬라이드 (현재 유지), 보더로 분리

---

## 5. 컴포넌트별 가이드

### 5.1 헤더
```
┌─────────────────────────────────────────────┐
│ $ skill-atlas                    [●][◐][○]  │  ← 프롬프트 + 테마/언어 토글
│ LOCAL / 001                                  │
│ Skill Atlas — 로컬 스킬 인벤토리              │
└─────────────────────────────────────────────┘
```
- `$` 프롬프트 기호로 시작 (모노, 액센트 색)
- 우측: 다크모드 토글 (이슈 #4) + 언어 토글 (이슈 #3)

### 5.2 탭 바
현재: 일반 버튼. 목표: **터미널 탭** — 하단 2px 액센트 바, 활성 탭만 색.
```
 [SKILLS 334] [AGENTS 274] [PROJECTS 60] [DUPS 15] [LINKS 191] [SOURCES 27]
 ────────────
```

### 5.3 필터 바
현재: 라벨 + select 박스. 목표: **인라인 프롬프트 필터** — `filter: [검색어] kind:global root:.codex`
- 가능한 필터는 인라인 칩/토큰으로 표시
- select는 터미널 스타일 (배경 투명, 보더 1px, 화살표 `▸`)

### 5.4 AG Grid
- 헤더: uppercase, muted, letter-spacing — **컬럼 헤더가 터미널 라벨처럼**
- 행: 호버 시 `--accent-soft` 배경, 선택 시 좌측 2px 액센트 바
- 보더: 행 간 1px `--line`
- 컬럼 리사이즈 핸들: 미세한 액센트 색 막대

### 5.5 상세 패널
현재: 일반 카드. 목표: **터미널 `man` 페이지 스타일**
```
┌─ SKILL INSPECTOR ───────────────────── × ─┐
│                                            │
│ add-gmail                                  │
│ Add Gmail integration to NanoClaw.        │
│                                            │
│ AGENT      Claude Code                     │
│ KIND       프로젝트 로컬                    │
│ SIZE       4,830 B                         │
│ MODIFIED   26. 02. 14.                     │
│ PATH       /Users/.../add-gmail/SKILL.md  │
│                                            │
│ ┌─ CONTENT ────────────────────────────┐  │
│ │ # Add Gmail                          │  │
│ │ ...                                  │  │
│ └──────────────────────────────────────┘  │
│                                            │
│ [스킬 삭제]                                │
└────────────────────────────────────────────┘
```
- 메타데이터를 `KEY → VALUE` 정렬 (모노, 좌측 정렬)
- 본문은 코드 블록 프레임 내

### 5.6 진행 바 (scan-rail)
- 상단 2px 바, 액센트 색 블록이 좌→우 스캔
- 로딩 텍스트: `scanning filesystem...` (모노, 점 애니메이션)

### 5.7 빈 상태
현재: ∅ 기호 + 메시지. 유지하되 **터미널 에러 스타일**:
```
$ scan --filter "없는 스킬"
→ no matches found
```

---

## 6. 다크모드 구현 (`[data-theme]`)

### 전략
```css
/* 기본: 시스템 감지 */
@media (prefers-color-scheme: dark) {
  :root { /* 다크 토큰 */ }
}

/* 수동 오버라이드 */
:root[data-theme="dark"] { /* 다크 토큰 */ }
:root[data-theme="light"] { /* 라이트 토큰 (명시) */ }
```

### 토글 UI
- 헤더 우측: 3상태 토글 (☀️ light / 🌙 dark / 🖥 system)
- localStorage `skill-atlas-theme` 저장
- 초기 로드 FOUC 방지: `<head>` 인라인 스크립트로 localStorage 읽어 `data-theme` 즉시 설정

### AG Grid 연동
AG Grid 테마 변수도 토큰에 연결:
```css
[data-theme="dark"] .skill-grid.ag-theme-quartz {
  --ag-background-color: var(--paper);
  --ag-header-background-color: var(--surface);
  --ag-odd-row-background-color: transparent;
  --ag-row-hover-color: var(--accent-soft);
  --ag-border-color: var(--line);
  --ag-header-cell-text: var(--muted);
}
```

---

## 7. 애니메이션

터미널 미학: **빠르고 기계적인 모션.** ease-out 짧은 지속.

| 액션 | 효과 | 지속 |
|---|---|---|
| 패널 슬라이드 | translateX(100%→0) | 180ms ease-out |
| 행 호버 | 배경 색 전환 | 80ms |
| 진행 바 스캔 | translateX 무한 | 0.9s |
| 다이얼로그 | opacity + 미세 scale | 120ms |
| 테마 전환 | 색상 전환 (transition on color/bg) | 150ms |

`prefers-reduced-motion` 시 모든 애니메이션 비활성화.

---

## 8. 구현 순서

1. **다크 토큰 세트** — `global.css`에 `[data-theme="dark"]` 블록 추가 (색만, 레이아웃 유지)
2. **테마 토글 UI** — 헤더에 3상태 토글 + localStorage + FOUC 방지 스크립트
3. **AG Grid 다크 연동** — 테마 변수 매핑
4. **모노스페이스 통일** — `--sans`를 `--mono`로, 타이포 크기/간격 조정
5. **터미널 스타일링** — 헤더 프롬프트, 탭 바, 필터 칩, 상세 `man` 페이지 레이아웃
6. **마이크로 인터랙션** — 점 애니메이션, 호버, reduced-motion 대응

각 단계는 별도 PR/커밋으로 분리 가능. 1-3이 이슈 #4(다크모드) 클로즈, 4-5가 본 디자인 개선.

---

## 9. 접근성

- 다크 테agrber 대비: 본문 `#e6edf3` on `#0d1117` = **15.3:1** (WCAG AAA)
- `muted` `#7d8590` on `#0d1117` = **4.8:1** (WCAG AA 통과)
- 포커스 링: 액센트 색 3px, 오프셋 2px (다크/라이트 공통)
- `prefers-reduced-motion` 존중
- `color-scheme` 메타로 브라우저 네이티브 요소(스크롤바)도 다크 대응
