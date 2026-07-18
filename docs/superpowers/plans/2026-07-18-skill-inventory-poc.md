# Skill Inventory PoC Implementation Plan

> **Superseded:** 페이지네이션 관련 단계와 acceptance는 `2026-07-18-unpaginated-skill-ledger.md` 및 해당 설계 문서로 대체되었습니다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Astro SSR와 Solid.js로 현재 macOS 파일시스템의 `SKILL.md`와 skill 링크를 재검색하고 탐색하는 읽기 전용 로컬 대시보드를 만든다.

**Architecture:** Astro Node standalone 서버가 제한된 파일시스템 스캐너와 메모리 스냅샷 캐시를 소유한다. Solid.js 대시보드는 읽기 전용 API를 통해 스냅샷을 받아 검색·필터·정렬·페이지네이션을 수행하고, allowlist로 검증된 skill 본문만 별도 API에서 읽는다.

**Tech Stack:** Astro 7.1.1, Solid.js 1.9.14, TypeScript 6.0.3, `@astrojs/node` 11.0.2, `@astrojs/solid-js` 7.0.1, Vitest 4.1.10, Solid Testing Library 0.8.10, jsdom 29.1.1, gray-matter 4.0.3, marked 18.0.6, sanitize-html 2.17.6

## Global Constraints

- 프로젝트 경로는 `/Users/pinion/dev/skill-manage`다.
- 최종 애플리케이션은 `/tmp` 인벤토리 파일 없이 독립적으로 검색해야 한다.
- 파일시스템 쓰기 API를 만들지 않는다.
- 상세 파일 읽기는 현재 스냅샷에 포함된 ID로만 허용한다.
- 기본 검색 루트는 `$HOME`, `/Applications`, `/Library`, `/usr/local`, `/opt/homebrew`다.
- `.git`, 캐시, 휴지통을 순회하지 않는다.
- UI는 한국어를 기본으로 한다.

---

### Task 1: Astro + Solid SSR 기반 구성

**Files:**
- Create: `package.json`
- Create: `astro.config.ts`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/env.d.ts`
- Create: `vitest.config.ts`
- Create: `src/pages/index.astro`
- Create: `src/layouts/AppLayout.astro`
- Create: `src/styles/global.css`

**Interfaces:**
- Produces: Astro Node standalone 앱, Solid island를 넣을 수 있는 기본 레이아웃

- [ ] **Step 1: 패키지와 스크립트 정의**

`package.json`을 다음 핵심 구조로 만든다.

```json
{
  "name": "skill-manage",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "start": "HOST=127.0.0.1 node ./dist/server/entry.mjs",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "npm run test && npm run check && npm run build"
  },
  "dependencies": {
    "@astrojs/node": "11.0.2",
    "@astrojs/solid-js": "7.0.1",
    "astro": "7.1.1",
    "gray-matter": "4.0.3",
    "marked": "18.0.6",
    "sanitize-html": "2.17.6",
    "solid-js": "1.9.14"
  },
  "devDependencies": {
    "@astrojs/check": "0.9.9",
    "@solidjs/testing-library": "0.8.10",
    "@testing-library/jest-dom": "6.9.1",
    "@types/node": "26.1.1",
    "@types/sanitize-html": "2.16.1",
    "jsdom": "29.1.1",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 2: SSR 설정 작성**

`astro.config.ts`:

```ts
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import solid from "@astrojs/solid-js";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [solid()],
  server: { host: "127.0.0.1" },
});
```

`tsconfig.json`은 `astro/tsconfigs/strict`를 확장하고 `jsxImportSource: "solid-js"`와 `src/*` 별칭을 추가한다.

- [ ] **Step 3: 기본 레이아웃과 전역 토큰 작성**

`AppLayout.astro`는 한국어 문서, viewport, title, 설명 메타를 제공한다. `global.css`는 다음 토큰을 정의한다.

```css
:root {
  --paper: #f3f1eb;
  --surface: #fffdf8;
  --ink: #172033;
  --muted: #687083;
  --line: #d8d5cc;
  --accent: #2457d6;
  --danger: #c33d45;
  --success: #14745b;
  --mono: "SFMono-Regular", "Cascadia Code", monospace;
  --sans: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 4: 의존성 설치와 초기 타입 검사**

Run:

```bash
npm install
npm run check
```

Expected: 의존성이 설치되고 Astro 진단 오류가 0개다.

- [ ] **Step 5: 기반 커밋**

```bash
git add package.json package-lock.json astro.config.ts tsconfig.json .gitignore src
git commit -m "build(app): Astro Solid SSR 기반 구성" -m "로컬 파일시스템 API와 Solid 대시보드를 같은 Node 런타임에서 제공하기 위한 기반을 마련한다."
```

---

### Task 2: 인벤토리 타입과 경로 분류기

**Files:**
- Create: `src/lib/inventory/types.ts`
- Create: `src/lib/inventory/classify.ts`
- Create: `src/lib/inventory/classify.test.ts`

**Interfaces:**
- Produces: `SkillKind`, `SkillRecord`, `SkillLink`, `InventoryRoot`, `InventorySnapshot`, `classifyPath()`, `inferConfigRoot()`

- [ ] **Step 1: 실패하는 분류 테스트 작성**

다음 사례를 fixture table로 검증한다.

```ts
it.each([
  ["/Users/me/.codex/skills/foo/SKILL.md", "user/global-config", "/Users/me/.codex"],
  ["/Applications/Codex.app/Contents/x/skills/foo/SKILL.md", "app-bundled", "/Applications/Codex.app"],
  ["/Users/me/.codex/plugins/cache/x/skills/foo/SKILL.md", "plugin/cache/vendor", "/Users/me/.codex"],
  ["/Users/me/dev/app/.claude/skills/foo/SKILL.md", "project/source-local", "/Users/me/dev/app/.claude"],
])("classifies %s", (path, kind, root) => {
  expect(classifyPath(path, "/Users/me")).toBe(kind);
  expect(inferConfigRoot(path, "/Users/me")).toBe(root);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/inventory/classify.test.ts`

Expected: 모듈이 없어 FAIL.

- [ ] **Step 3: 타입과 최소 분류 구현**

핵심 타입:

```ts
export type SkillKind =
  | "user/global-config"
  | "app-bundled"
  | "app-runtime"
  | "plugin/cache/vendor"
  | "installed-package/source-dependency"
  | "project/source-local"
  | "backup/temp/fixture"
  | "other";

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  path: string;
  fileName: string;
  recordType: "skill" | "document";
  skillsRoot: string;
  configRoot: string;
  kind: SkillKind;
  modifiedAt: string;
  size: number;
  device: number;
  inode: number;
}
```

분류 순서는 backup/temp → plugin/cache → app → installed package → 알려진 사용자 설정 → project local → runtime → other로 고정한다.

- [ ] **Step 4: 분류 테스트 통과 확인**

Run: `npm test -- src/lib/inventory/classify.test.ts`

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/inventory
git commit -m "feat(scanner): 스킬 경로 분류 모델 추가" -m "파일 위치를 설정 루트와 성격별로 일관되게 집계할 수 있도록 순수 분류 경계를 둔다."
```

---

### Task 3: 읽기 전용 파일시스템 스캐너

**Files:**
- Create: `src/lib/inventory/scanner.ts`
- Create: `src/lib/inventory/scanner.test.ts`

**Interfaces:**
- Consumes: Task 2 타입과 분류기
- Produces: `scanInventory(options?)`, `defaultScanOptions()`

- [ ] **Step 1: 임시 디렉터리 fixture 테스트 작성**

테스트는 다음 구조를 만들고 종료 후 삭제한다.

```text
fixture/
  .codex/skills/alpha/SKILL.md
  project/.claude/skills/no-frontmatter/SKILL.md
  links/skills/alpha-link -> .codex/skills/alpha
  links/skills/missing -> missing-target
  .git/skills/ignored/SKILL.md
```

검증 항목:

```ts
expect(snapshot.skills).toHaveLength(2);
expect(snapshot.skills.find((skill) => skill.name === "alpha")?.description).toBe("Alpha skill");
expect(snapshot.links.some((link) => link.status === "healthy")).toBe(true);
expect(snapshot.links.some((link) => link.status === "broken")).toBe(true);
expect(snapshot.skills.some((skill) => skill.path.includes("ignored"))).toBe(false);
```

- [ ] **Step 2: 스캐너 테스트 실패 확인**

Run: `npm test -- src/lib/inventory/scanner.test.ts`

Expected: `scanInventory`가 없어 FAIL.

- [ ] **Step 3: 제한 동시성 순회 구현**

`scanInventory`는 `fs.promises.opendir`, `lstat`, `readlink`, `realpath`를 사용한다. 심볼릭 링크 디렉터리는 따라가지 않는다. 제외 디렉터리는 진입 전에 건너뛴다. 파일명이 대소문자 무관 `SKILL.md` 또는 `SKILLS.md`일 때만 후보로 수집한다.

frontmatter 파싱은 `gray-matter`, ID는 다음 규칙을 사용한다.

```ts
const id = createHash("sha256").update(normalizedPath).digest("hex").slice(0, 16);
```

오류는 최대 100개 대표 경로와 전체 개수로 누적한다.

- [ ] **Step 4: 통계와 중복 이름 집계 구현**

스냅샷은 다음을 포함한다.

```ts
{
  generatedAt,
  durationMs,
  searchRoots,
  skills,
  links,
  roots,
  errors,
  stats: {
    matchedFiles,
    skillDefinitions,
    documents,
    uniqueNames,
    configRoots,
    healthyLinks,
    brokenLinks
  }
}
```

- [ ] **Step 5: 테스트 통과 및 실제 작은 루트 smoke 확인**

Run:

```bash
npm test -- src/lib/inventory/scanner.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/inventory
git commit -m "feat(scanner): SKILL 파일시스템 검색 구현" -m "임시 보고서 없이 현재 파일과 심볼릭 링크 상태를 안전하게 재구성한다."
```

---

### Task 4: 스냅샷 캐시와 읽기 전용 API

**Files:**
- Create: `src/lib/inventory/store.ts`
- Create: `src/lib/inventory/store.test.ts`
- Create: `src/lib/inventory/markdown.ts`
- Create: `src/pages/api/inventory/index.ts`
- Create: `src/pages/api/inventory/refresh.ts`
- Create: `src/pages/api/skills/content.ts`

**Interfaces:**
- Consumes: `scanInventory()`와 `InventorySnapshot`
- Produces: `getInventory()`, `refreshInventory()`, `getSkillContent(id)`, 세 API endpoint

- [ ] **Step 1: 캐시 동시성 테스트 작성**

주입한 가짜 scanner를 동시에 두 번 호출하고 실제 scanner 호출이 한 번인지 검증한다. refresh 실패 시 이전 snapshot이 유지되는지도 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/inventory/store.test.ts`

Expected: store 모듈이 없어 FAIL.

- [ ] **Step 3: 캐시와 allowlist 구현**

모듈 상태:

```ts
let snapshot: InventorySnapshot | undefined;
let inFlight: Promise<InventorySnapshot> | undefined;
```

`getSkillContent(id)`는 현재 snapshot의 `skills`에서 ID를 찾고, 알 수 없는 ID와 1MiB보다 큰 파일을 거부하며, 파일명이 대소문자 무관 `SKILL.md` 또는 `SKILLS.md`인지 다시 확인한다. 테스트는 unknown ID, 파일 삭제, 크기 제한을 포함한다.

- [ ] **Step 4: Markdown 안전 렌더링 구현**

```ts
const unsafe = await marked.parse(markdown, { gfm: true });
const html = sanitizeHtml(unsafe, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "title"] },
  allowedSchemes: ["http", "https", "mailto"],
});
```

API는 `{ markdown, html }`을 반환한다.

- [ ] **Step 5: Astro API endpoint 작성**

- `GET /api/inventory`: `getInventory()`
- `POST /api/inventory/refresh`: `refreshInventory()`
- `GET /api/skills/content?id=...`: allowlist 상세

모든 응답은 `Cache-Control: no-store`를 사용한다.

- [ ] **Step 6: 테스트와 타입 검사**

Run:

```bash
npm test -- src/lib/inventory/store.test.ts
npm run check
```

Expected: PASS, Astro 오류 0개.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/inventory src/pages/api
git commit -m "feat(api): 읽기 전용 인벤토리 API 추가" -m "동시 재검색을 합치고 현재 스냅샷의 skill만 상세 조회하도록 파일 접근 범위를 제한한다."
```

---

### Task 5: 검색·필터·정렬 모델

**Files:**
- Create: `src/lib/dashboard/filter.ts`
- Create: `src/lib/dashboard/filter.test.ts`

**Interfaces:**
- Consumes: `SkillRecord`
- Produces: `applySkillQuery(records, state)`, `paginate(records, page, pageSize)`

- [ ] **Step 1: 실패하는 순수 함수 테스트 작성**

이름·설명·경로의 대소문자 무관 검색, 복수 kind/root 필터, 이름·경로·수정일 정렬, 범위를 벗어난 페이지 보정을 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/lib/dashboard/filter.test.ts`

Expected: 모듈이 없어 FAIL.

- [ ] **Step 3: 최소 필터 모델 구현**

```ts
export interface DashboardQuery {
  search: string;
  kinds: SkillKind[];
  roots: string[];
  sort: "name" | "path" | "modified";
  direction: "asc" | "desc";
}
```

검색 문자열은 trim 후 소문자로 정규화한다. 입력 배열을 mutate하지 않는다.

- [ ] **Step 4: 테스트 통과 확인 및 커밋**

```bash
npm test -- src/lib/dashboard/filter.test.ts
git add src/lib/dashboard
git commit -m "feat(ui): 인벤토리 탐색 모델 추가" -m "대량 목록의 검색과 필터 동작을 UI와 분리해 예측 가능하게 검증한다."
```

---

### Task 6: Solid 대시보드와 상세 패널

**Files:**
- Create: `src/components/dashboard/SkillDashboard.tsx`
- Create: `src/components/dashboard/SkillDashboard.test.tsx`
- Create: `src/components/dashboard/StatsStrip.tsx`
- Create: `src/components/dashboard/FilterBar.tsx`
- Create: `src/components/dashboard/SkillTable.tsx`
- Create: `src/components/dashboard/SkillDetail.tsx`
- Create: `src/components/dashboard/LinkHealthPanel.tsx`
- Create: `src/components/dashboard/dashboard.css`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: 인벤토리 API, content API, Task 5 탐색 모델
- Produces: 반응형 읽기 전용 대시보드

- [ ] **Step 1: frontend-design 지침 적용**

구현 전에 `frontend-design` 스킬을 읽고 다음 금지 사항을 지킨다.

- 과도한 카드 그리드 금지
- 의미 없는 gradient·glassmorphism 금지
- 모든 요소에 둥근 모서리 적용 금지
- 정보 계층, 경로 가독성, 상태 대비 우선

- [ ] **Step 2: 데이터 로딩과 재검색 상태 구현**

`SkillDashboard`는 `createResource`로 GET을 수행하고 재검색 시 POST 결과로 snapshot을 교체한다. 버튼에는 진행 상태와 `aria-live` 피드백을 제공한다.

- [ ] **Step 3: 통계와 필터 구현**

통계는 6개 이하 핵심 수치만 한 줄 strip으로 표현한다. 필터는 검색, agent root, kind, 정렬을 제공하고 현재 결과 수와 초기화 버튼을 노출한다.

- [ ] **Step 4: 목록과 페이지네이션 구현**

50개 단위 목록을 사용한다. 데스크톱 표 헤더는 sticky, 모바일에서는 각 행을 label-value 구조로 재배치한다. 경로는 중간 생략 없이 CSS overflow로 처리하고 `title`에 전체 경로를 둔다.

- [ ] **Step 5: 상세 패널 구현**

행 선택 시 content API를 호출한다. 패널은 dialog semantics, Escape 닫기, close button, focusable heading을 제공한다. 서버가 정화한 HTML만 `innerHTML`로 삽입한다.

- [ ] **Step 6: 링크 상태 패널 구현**

정상·깨진 링크 수와 설정 루트별 집계를 제공하고 깨진 링크를 우선 정렬한다. 읽기 전용 표시만 제공한다.

- [ ] **Step 7: 타입 검사와 수동 반응형 확인**

Run:

```bash
npm run check
npm run dev
```

Expected: `/`에서 초기 검색, 필터, 페이지 이동, 상세 열기, 재검색이 동작한다. 390px와 1440px에서 가로 스크롤로 핵심 UI가 잘리지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add src/components src/pages/index.astro src/styles
git commit -m "feat(ui): 스킬 인벤토리 대시보드 구현" -m "수천 개 skill을 통계와 검색, 상세 본문, 링크 상태로 빠르게 탐색할 수 있게 한다."
```

---

### Task 7: 문서화와 최종 통합 검증

**Files:**
- Create: `README.md`
- Modify: 필요한 기존 파일만

**Interfaces:**
- Produces: 설치·실행·보안 범위 문서와 검증된 production build

- [ ] **Step 1: README 작성**

다음을 명시한다.

- `npm install`, `npm run dev`
- localhost 전용 읽기 전용 PoC
- 검색 루트와 제외 경로
- 재검색 동작
- 테스트 및 build 명령
- 권한 오류와 깨진 링크는 표시만 하며 수정하지 않음

- [ ] **Step 2: 전체 검증 실행**

Run:

```bash
npm run verify
```

Expected: Vitest 0 failures, Astro diagnostics 0 errors, production build exit 0.

- [ ] **Step 3: production 서버 smoke test**

Run:

```bash
npm start
curl --fail http://localhost:4321/
curl --fail http://localhost:4321/api/inventory
curl --fail -X POST -H 'Origin: http://127.0.0.1:4321' http://127.0.0.1:4321/api/inventory/refresh
```

Expected: 모두 2xx이며 inventory JSON에 `skills`, `links`, `stats`가 있다. 테스트 후 서버를 종료한다.

- [ ] **Step 4: 브라우저 QA**

브라우저에서 다음을 검증한다.

- 통계 값 표시
- 이름 검색
- kind/root 필터
- 50개 페이지네이션
- 상세 Markdown
- 깨진 링크 목록
- 재검색
- 모바일 레이아웃

- [ ] **Step 5: 최종 커밋**

```bash
git add README.md
git commit -m "docs(readme): 로컬 인벤토리 실행법 추가" -m "읽기 전용 범위와 검색·검증 절차를 사용자가 재현할 수 있도록 기록한다."
```

- [ ] **Step 6: 독립 코드 리뷰**

`superpowers:requesting-code-review`로 설계 명세와 전체 diff를 검토한다. Critical·Important 항목을 모두 수정하고 `npm run verify`를 다시 실행한다.
