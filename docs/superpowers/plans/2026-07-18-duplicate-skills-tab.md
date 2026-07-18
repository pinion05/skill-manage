# Duplicate Skills Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같은 이름으로 여러 위치에 설치된 `SKILL.md`를 전체 snapshot에서 찾아 이름별 그룹 탭으로 표시한다.

**Architecture:** 순수 함수가 `SkillRecord[]`를 정규화한 이름으로 O(n) 그룹화하고, Solid memo가 snapshot마다 결과를 갱신한다. 새 패널은 그룹과 설치 경로를 렌더링하며 기존 상세 dialog 선택·focus 복원 흐름을 재사용한다. API와 scanner는 변경하지 않는다.

**Tech Stack:** Astro 7, Solid.js 1.9, TypeScript 6, Vitest 4, Solid Testing Library

## Global Constraints

- `recordType === "skill"`인 `SKILL.md` 정의만 포함한다.
- 이름 비교는 Unicode NFKC 정규화, trim, locale 소문자 변환 순서로 수행한다.
- 기존 Skill 탭의 검색·필터와 무관하게 전체 snapshot을 집계한다.
- 그룹은 이름순, 설치는 절대경로순으로 정렬한다.
- API, scanner, 파일시스템 읽기 전용 경계는 변경하지 않는다.
- pagination, 가상 스크롤, 무한 로딩을 추가하지 않는다.

---

## File Map

- Create: `src/lib/dashboard/duplicate-skills.ts` — 이름 정규화와 중복 그룹 순수 함수.
- Create: `src/lib/dashboard/duplicate-skills.test.ts` — 집계 규칙과 불변성 단위 테스트.
- Create: `src/components/dashboard/DuplicateSkillsPanel.tsx` — 중복 그룹 목록과 설치 선택 UI.
- Modify: `src/components/dashboard/SkillDashboard.tsx` — 세 번째 보기, memo, 상세 선택 연결.
- Modify: `src/components/dashboard/SkillDashboard.test.tsx` — tab badge, 그룹, 빈 상태, 상세 focus 회귀 테스트.
- Modify: `src/components/dashboard/dashboard.css` — 데스크톱·모바일 중복 그룹 레이아웃.
- Modify: `README.md` — 중복 설치 탭 기능 설명.
- Modify: `docs/superpowers/specs/2026-07-18-skill-inventory-poc-design.md` — 현재 화면 구조 갱신.

### Task 1: 중복 이름 그룹 순수 함수

**Files:**
- Create: `src/lib/dashboard/duplicate-skills.ts`
- Create: `src/lib/dashboard/duplicate-skills.test.ts`

**Interfaces:**
- Consumes: `SkillRecord[]`
- Produces: `normalizeSkillName(name: string): string`
- Produces: `groupDuplicateSkills(records: SkillRecord[]): DuplicateSkillGroup[]`
- Produces: `DuplicateSkillGroup { key: string; name: string; installs: SkillRecord[] }`

- [x] **Step 1: 실패 단위 테스트 작성**

`src/lib/dashboard/duplicate-skills.test.ts`를 생성한다.

```ts
import { describe, expect, it } from "vitest";
import type { SkillRecord } from "../inventory/types";
import { groupDuplicateSkills, normalizeSkillName } from "./duplicate-skills";

function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: "alpha",
    description: "",
    path: "/Users/me/.codex/skills/alpha/SKILL.md",
    fileName: "SKILL.md",
    recordType: "skill",
    skillsRoot: "/Users/me/.codex/skills",
    configRoot: "/Users/me/.codex",
    agent: "OpenAI Codex",
    kind: "user/global-config",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    size: 100,
    device: 1,
    inode: 1,
    ...overrides,
  };
}

describe("groupDuplicateSkills", () => {
  it("groups normalized SKILL.md names and excludes documents and singletons", () => {
    const records = [
      skill({ id: "a", name: " Alpha ", path: "/z/SKILL.md" }),
      skill({ id: "b", name: "ＡLPHA", path: "/a/SKILL.md" }),
      skill({ id: "doc", name: "alpha", recordType: "document", fileName: "skills.md" }),
      skill({ id: "single", name: "beta", path: "/b/SKILL.md" }),
    ];

    expect(normalizeSkillName(" Ａlpha ")).toBe("alpha");
    expect(groupDuplicateSkills(records)).toEqual([
      {
        key: "alpha",
        name: "Alpha",
        installs: [records[1], records[0]],
      },
    ]);
  });

  it("sorts groups by name and does not mutate input order", () => {
    const records = [
      skill({ id: "z2", name: "zeta", path: "/z/2/SKILL.md" }),
      skill({ id: "a2", name: "alpha", path: "/a/2/SKILL.md" }),
      skill({ id: "z1", name: "ZETA", path: "/z/1/SKILL.md" }),
      skill({ id: "a1", name: "Alpha", path: "/a/1/SKILL.md" }),
    ];
    const originalIds = records.map((record) => record.id);

    const groups = groupDuplicateSkills(records);

    expect(groups.map((group) => group.key)).toEqual(["alpha", "zeta"]);
    expect(groups[0]!.installs.map((record) => record.id)).toEqual(["a1", "a2"]);
    expect(records.map((record) => record.id)).toEqual(originalIds);
  });
});
```

- [x] **Step 2: 단위 테스트가 올바르게 실패하는지 확인**

Run:

```bash
npm test -- src/lib/dashboard/duplicate-skills.test.ts
```

Expected: `./duplicate-skills` module을 찾지 못해 FAIL.

- [x] **Step 3: 최소 그룹 구현 작성**

`src/lib/dashboard/duplicate-skills.ts`를 생성한다.

```ts
import type { SkillRecord } from "../inventory/types";

export interface DuplicateSkillGroup {
  key: string;
  name: string;
  installs: SkillRecord[];
}

const collator = new Intl.Collator(["ko", "en"], {
  numeric: true,
  sensitivity: "base",
});

function compareText(left: string, right: string): number {
  const comparison = collator.compare(left, right);
  if (comparison !== 0) return comparison;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeSkillName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase();
}

export function groupDuplicateSkills(records: SkillRecord[]): DuplicateSkillGroup[] {
  const grouped = new Map<string, SkillRecord[]>();
  for (const record of records) {
    if (record.recordType !== "skill") continue;
    const key = normalizeSkillName(record.name);
    if (!key) continue;
    const installs = grouped.get(key);
    if (installs) installs.push(record);
    else grouped.set(key, [record]);
  }

  return [...grouped.entries()]
    .filter(([, installs]) => installs.length > 1)
    .map(([key, recordsForName]) => ({
      key,
      name: recordsForName[0]!.name.trim() || key,
      installs: recordsForName.toSorted((left, right) => compareText(left.path, right.path)),
    }))
    .toSorted((left, right) => compareText(left.key, right.key));
}
```

- [x] **Step 4: 단위 테스트 통과 확인**

Run:

```bash
npm test -- src/lib/dashboard/duplicate-skills.test.ts
```

Expected: 1 test file, 2 tests PASS.

- [x] **Step 5: Task 1 커밋**

```bash
git add src/lib/dashboard/duplicate-skills.ts src/lib/dashboard/duplicate-skills.test.ts
git commit -m "feat(ui): 중복 Skill 그룹 모델 추가"
```

### Task 2: 중복 설치 탭과 상세 연결

**Files:**
- Create: `src/components/dashboard/DuplicateSkillsPanel.tsx`
- Modify: `src/components/dashboard/SkillDashboard.tsx`
- Modify: `src/components/dashboard/SkillDashboard.test.tsx`
- Modify: `src/components/dashboard/dashboard.css`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-18-skill-inventory-poc-design.md`

**Interfaces:**
- Consumes: `DuplicateSkillGroup[]` from Task 1
- Produces: `DuplicateSkillsPanel({ groups, onSelect })`
- Calls: `onSelect(skill: SkillRecord, trigger: HTMLButtonElement): void`

- [x] **Step 1: tab·그룹·상세·빈 상태 실패 테스트 작성**

`src/components/dashboard/SkillDashboard.test.tsx`에 helper와 테스트를 추가한다.

```tsx
function duplicateInventory(): InventorySnapshot {
  const snapshot = inventory("Alpha");
  const first = snapshot.skills[0]!;
  snapshot.skills = [
    first,
    {
      ...first,
      id: "skill-alpha-claude",
      name: "alpha",
      path: "/Users/me/.claude/skills/alpha/SKILL.md",
      skillsRoot: "/Users/me/.claude/skills",
      configRoot: "/Users/me/.claude",
      agent: "Claude Code",
      inode: 3,
    },
  ];
  snapshot.stats.matchedFiles = 2;
  snapshot.stats.skillDefinitions = 2;
  snapshot.roots[0]!.skillCount = 2;
  return snapshot;
}

it("shows duplicate installs by normalized name and opens their detail", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/skills/content")
        ? jsonResponse({ id: "skill-alpha", path: "/tmp/SKILL.md", markdown: "# A", html: "<h1>A</h1>" })
        : jsonResponse(duplicateInventory()),
    ),
  );
  render(() => <SkillDashboard />);

  const tab = await screen.findByRole("button", { name: "중복 설치 1" });
  fireEvent.click(tab);
  expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
  expect(screen.getByText("2곳 설치")).toBeInTheDocument();
  expect(screen.getByText("/Users/me/.codex", { selector: "code.duplicate-config-root" })).toBeInTheDocument();
  expect(screen.getByText("/Users/me/.claude/skills/alpha/SKILL.md")).toBeInTheDocument();

  const trigger = screen.getByRole("button", {
    name: "alpha · Claude Code · 사용자 설정 · /Users/me/.claude · /Users/me/.claude/skills/alpha/SKILL.md 상세 보기",
  });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveAccessibleName("alpha");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("shows an empty state when no skill name is installed twice", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(inventory())));
  render(() => <SkillDashboard />);

  fireEvent.click(await screen.findByRole("button", { name: "중복 설치 0" }));
  expect(screen.getByText("중복 설치된 skill이 없습니다.")).toBeInTheDocument();
});
```

- [x] **Step 2: Dashboard 테스트가 기능 부재로 실패하는지 확인**

Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx
```

Expected: `중복 설치` 버튼을 찾지 못해 두 신규 테스트 FAIL.

- [x] **Step 3: DuplicateSkillsPanel 구현**

`src/components/dashboard/DuplicateSkillsPanel.tsx`를 생성한다.

```tsx
import { For, Show } from "solid-js";
import type { DuplicateSkillGroup } from "../../lib/dashboard/duplicate-skills";
import type { SkillRecord } from "../../lib/inventory/types";
import { kindLabel } from "./FilterBar";

interface Props {
  groups: DuplicateSkillGroup[];
  onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void;
}

export function DuplicateSkillsPanel(props: Props) {
  const installCount = () => props.groups.reduce((total, group) => total + group.installs.length, 0);

  return (
    <section class="duplicate-skills" aria-labelledby="duplicate-skills-title">
      <header class="duplicate-skills-heading">
        <div>
          <p class="section-kicker">DUPLICATE INSTALLS</p>
          <h2 id="duplicate-skills-title">중복 설치 Skill</h2>
          <p>{props.groups.length.toLocaleString("ko-KR")}개 이름 · {installCount().toLocaleString("ko-KR")}개 설치</p>
        </div>
      </header>

      <Show
        when={props.groups.length > 0}
        fallback={
          <div class="duplicate-empty">
            <span aria-hidden="true">✓</span>
            <strong>중복 설치된 skill이 없습니다.</strong>
            <p>같은 이름의 SKILL.md가 두 위치 이상 발견되면 여기에 표시됩니다.</p>
          </div>
        }
      >
        <div class="duplicate-group-list">
          <For each={props.groups}>
            {(group) => (
              <article class="duplicate-group">
                <header>
                  <h3>{group.name}</h3>
                  <span>{group.installs.length.toLocaleString("ko-KR")}곳 설치</span>
                </header>
                <ul>
                  <For each={group.installs}>
                    {(skill) => (
                      <li>
                        <button
                          type="button"
                          aria-label={`${skill.name} · ${skill.agent} · ${kindLabel(skill.kind)} · ${skill.configRoot} · ${skill.path} 상세 보기`}
                          onClick={(event) => props.onSelect(skill, event.currentTarget)}
                        >
                          <span class="duplicate-install-meta">
                            <strong>{skill.agent}</strong>
                            <span>{kindLabel(skill.kind)}</span>
                          </span>
                          <span class="duplicate-path-field">
                            <small>설정 루트</small>
                            <code class="duplicate-config-root">{skill.configRoot}</code>
                          </span>
                          <span class="duplicate-path-field">
                            <small>SKILL PATH</small>
                            <code>{skill.path}</code>
                          </span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
```

- [x] **Step 4: Dashboard에 세 번째 view와 상세 선택 연결**

`SkillDashboard.tsx`에 `Match`, `Switch`, `DuplicateSkillsPanel`, `groupDuplicateSkills`, `normalizeSkillName`을 import한다. 상태와 memo를 다음처럼 확장한다.

```tsx
const [view, setView] = createSignal<"skills" | "duplicates" | "links">("skills");
const duplicateGroups = createMemo(() => groupDuplicateSkills(snapshot()?.skills ?? []));
```

기존 상세 패널의 같은 이름 비교도 동일한 정규화 함수를 사용한다.

```tsx
const selectedDuplicates = createMemo(() => {
  const current = selected();
  if (!current || !snapshot()) return [];
  const name = normalizeSkillName(current.name);
  return snapshot()!.skills.filter(
    (skill) => skill.id !== current.id && normalizeSkillName(skill.name) === name,
  );
});
```

기존 두 버튼 사이에 다음 버튼을 추가한다.

```tsx
<button
  type="button"
  aria-pressed={view() === "duplicates"}
  classList={{ active: view() === "duplicates" }}
  onClick={() => setView("duplicates")}
>
  중복 설치 <span>{duplicateGroups().length.toLocaleString("ko-KR")}</span>
</button>
```

기존 skills/link `<Show>`를 다음 switch로 교체한다.

```tsx
<Switch>
  <Match when={view() === "skills"}>
    <FilterBar
      query={query()}
      roots={rootsWithSkills()}
      resultCount={filteredSkills().length}
      onSearch={(search) => updateQuery({ search })}
      onKind={(kind: SkillKind | "") => updateQuery({ kinds: kind ? [kind] : [] })}
      onRoot={(root) => updateQuery({ roots: root ? [root] : [] })}
      onRecordType={(recordType: SkillRecordType | "") =>
        updateQuery({ recordTypes: recordType ? [recordType] : [] })
      }
      onSort={(sort, direction) => updateQuery({ sort, direction })}
      onReset={() => setQuery(INITIAL_QUERY)}
    />
    <SkillTable
      skills={filteredSkills()}
      selectedId={selected()?.id}
      onSelect={(skill, trigger) => {
        detailTrigger = trigger;
        setSelected(skill);
      }}
    />
  </Match>
  <Match when={view() === "duplicates"}>
    <DuplicateSkillsPanel
      groups={duplicateGroups()}
      onSelect={(skill, trigger) => {
        detailTrigger = trigger;
        setSelected(skill);
      }}
    />
  </Match>
  <Match when={view() === "links"}>
    <LinkHealthPanel links={current().links} roots={current().roots} />
  </Match>
</Switch>
```

- [x] **Step 5: 중복 그룹 스타일 추가**

`dashboard.css`에 다음 규칙을 추가한다.

```css
.duplicate-skills { padding: 2rem 0 3rem; }
.duplicate-skills-heading { padding-bottom: 1rem; border-bottom: 1px solid var(--ink); }
.duplicate-skills-heading h2 { margin-top: 0.35rem; font: 700 clamp(1.8rem, 3vw, 2.8rem)/1 var(--display); }
.duplicate-skills-heading p:last-child { margin-top: 0.5rem; color: var(--muted); font-size: 0.8rem; }
.duplicate-group-list { display: grid; }
.duplicate-group { border-bottom: 1px solid var(--ink); }
.duplicate-group > header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: 1rem 0 0.75rem; }
.duplicate-group h3 { font: 700 1.25rem/1.1 var(--display); overflow-wrap: anywhere; }
.duplicate-group > header span { color: var(--accent); font: 700 0.64rem/1 var(--mono); }
.duplicate-group ul { margin: 0; padding: 0; list-style: none; }
.duplicate-group li { border-top: 1px solid var(--line); }
.duplicate-group li > button { width: 100%; display: grid; grid-template-columns: 11rem minmax(12rem, .7fr) minmax(18rem, 1.3fr); gap: 1rem; align-items: start; padding: 0.85rem 0; border: 0; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.duplicate-group li > button:hover { background: color-mix(in srgb, var(--accent-soft) 62%, transparent); }
.duplicate-install-meta, .duplicate-path-field { min-width: 0; display: grid; gap: 0.3rem; }
.duplicate-install-meta strong { font-size: 0.76rem; }
.duplicate-install-meta span, .duplicate-path-field small { color: var(--muted); font: 0.6rem/1.2 var(--mono); }
.duplicate-path-field code { color: #3f4b5f; font: 0.64rem/1.4 var(--mono); white-space: normal; overflow-wrap: anywhere; }
.duplicate-empty { min-height: 22rem; display: grid; place-content: center; justify-items: center; gap: 0.5rem; text-align: center; }
.duplicate-empty > span { color: var(--success); font: 300 3rem/1 var(--display); }
.duplicate-empty p { color: var(--muted); font-size: 0.78rem; }
```

`@media (max-width: 760px)` 안에 다음 규칙을 추가한다.

```css
.duplicate-group > header { align-items: flex-start; }
.duplicate-group li > button { grid-template-columns: 1fr; gap: 0.65rem; }
.duplicate-path-field code { white-space: normal; overflow-wrap: anywhere; }
```

- [x] **Step 6: Dashboard 회귀 테스트 통과 확인**

Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx src/lib/dashboard/duplicate-skills.test.ts
```

Expected: 두 test file의 모든 테스트 PASS.

- [x] **Step 7: 문서 갱신**

`README.md` 제공 기능에 `이름 기준 중복 설치 탭과 모든 설정 루트·경로 표시`를 명시한다. 기존 설계 문서의 탐색 영역과 완료 조건에 중복 설치 탭을 추가한다.

- [x] **Step 8: 전체 검증**

Run:

```bash
npm run verify
git diff --check
```

Expected: 모든 Vitest 테스트 PASS, Astro diagnostics 0개, production build 성공, whitespace 오류 없음.

- [x] **Step 9: 실제 브라우저 smoke**

실행 중인 `http://127.0.0.1:4321/`에서 다음을 확인한다.

- `중복 설치` badge 숫자와 렌더링된 `.duplicate-group` 수가 같다.
- 첫 그룹의 설치 개수가 실제 설치 button 수와 같다.
- 설정 루트와 절대경로가 표시된다.
- 설치 선택 시 상세 dialog가 열리고 Escape 후 trigger focus가 복원된다.
- 390px viewport에서 경로가 화면 밖으로 잘리지 않는다.

- [x] **Step 10: Task 2 커밋**

```bash
git add README.md docs/superpowers src/components/dashboard
git commit -m "feat(ui): 중복 설치 Skill 탭 추가"
```

- [x] **Step 11: 독립 코드 리뷰와 최종 검증**

`main..HEAD`에서 중복 판정 규칙, 전체 snapshot 집계, 접근성, focus 복원, 모바일 경로 보존을 리뷰한다. Critical/Important가 없으면 `npm run verify`를 다시 실행한다.

리뷰 remediation도 이 단계에 포함한다.

- 설치 button accessible name에 성격과 `configRoot`를 포함한다.
- base/numeric collator 동률에 code-point tie-breaker를 적용한다.
- Skill 필터 독립성과 refresh 후 memo 갱신을 회귀 테스트한다.
