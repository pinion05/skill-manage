# Agent and Project Skill Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 Skill을 제외한 에이전트별 전역 Skill 보기와, project dir 아래 물리 Skill·연결 에이전트를 한 번씩 보여주는 프로젝트 보기를 추가한다.

**Architecture:** 기존 `InventorySnapshot.skills`를 입력으로 받는 순수 projection module이 physical identity, scope, owner, project directory를 집계한다. Solid panel은 projection만 렌더링하고 기존 `SkillDetail` 선택 흐름을 재사용하므로 scanner/API/cache/security 경계는 바꾸지 않는다.

**Tech Stack:** Astro 7 SSR, Solid.js 1.9, TypeScript 6, Vitest 4, Solid Testing Library, CSS

## Global Constraints

- 두 새 탭은 `recordType === "skill"`인 `SKILL.md`만 집계하고 `skills.md` document는 제외한다.
- Agent 집계는 project sighting을 버리되 같은 record의 user/admin sighting은 유지한다.
- Project 집계는 같은 `(project dir, device, inode)`를 한 번만 표시하고 owner·alias를 합친다.
- `공유 디렉터리`는 Agent 보기의 첫 그룹이다.
- official/full mode를 모두 지원하고 full mode의 공식 metadata 없는 record만 기존 kind/path로 보완한다.
- 기존 scanner, API response, inode dedupe, content allowlist, mode cache를 변경하지 않는다.
- pagination이나 편집 기능을 추가하지 않는다.
- 390px viewport에서 수평 overflow가 없어야 한다.

---

## File Map

- Create: `src/lib/dashboard/skill-views.ts` — agent/project projection, path inference, deterministic sorting.
- Create: `src/lib/dashboard/skill-views.test.ts` — scope, physical dedupe, owner merge, fallback regression tests.
- Create: `src/components/dashboard/AgentSkillsPanel.tsx` — shared-first owner groups and global Skill rows.
- Create: `src/components/dashboard/ProjectSkillsPanel.tsx` — project directory groups and merged owner/alias rows.
- Modify: `src/components/dashboard/SkillDashboard.tsx` — two tabs, memos, badges, detail callbacks.
- Modify: `src/components/dashboard/SkillDashboard.test.tsx` — tab semantics and detail focus tests.
- Modify: `src/components/dashboard/dashboard.css` — panels, long paths, responsive rules.
- Modify: `README.md` — new view behavior.
- Modify: `docs/superpowers/plans/2026-07-18-agent-project-skill-views.md` — completion checkboxes.

### Task 1: Pure agent/project projections

**Files:**
- Create: `src/lib/dashboard/skill-views.ts`
- Create: `src/lib/dashboard/skill-views.test.ts`

**Interfaces:**

```ts
export interface SkillViewAlias {
  path: string;
  owner: OfficialSourceOwner;
}

export interface AgentSkillEntry {
  skill: SkillRecord;
  aliases: SkillViewAlias[];
}

export interface AgentSkillGroup {
  owner: OfficialSourceOwner;
  skills: AgentSkillEntry[];
}

export interface AgentSkillProjection {
  groups: AgentSkillGroup[];
  skillCount: number;
}

export interface ProjectSkillEntry {
  skill: SkillRecord;
  owners: OfficialSourceOwner[];
  aliases: SkillViewAlias[];
}

export interface ProjectSkillGroup {
  directory: string;
  ownerCount: number;
  skills: ProjectSkillEntry[];
}

export interface ProjectSkillProjection {
  groups: ProjectSkillGroup[];
  skillCount: number;
}

export function inferProjectDirectory(
  skillsRoot: string,
  configRoot?: string,
): string | undefined;
export function createAgentSkillProjection(records: SkillRecord[]): AgentSkillProjection;
export function createProjectSkillProjection(records: SkillRecord[]): ProjectSkillProjection;
```

- [x] **Step 1: Write failing projection tests**

Create a `skill()` fixture with stable `device/inode`, then cover these exact cases:

```ts
it("keeps global memberships, excludes project-only records and documents", () => {
  const globalAndProject = skill({
    id: "mixed",
    sourceSightings: [
      sighting("user", "claude-code", "Claude Code", "/Users/me/.claude/skills"),
      sighting("project", "cursor", "Cursor", "/Users/me/dev/app/.cursor/skills"),
    ],
  });
  const projectOnly = skill({
    id: "project-only",
    inode: 2,
    kind: "project/source-local",
    sourceSightings: [
      sighting("project", "claude-code", "Claude Code", "/Users/me/dev/app/.claude/skills"),
    ],
  });
  const document = skill({ id: "doc", inode: 3, recordType: "document", fileName: "skills.md" });

  const result = createAgentSkillProjection([globalAndProject, projectOnly, document]);

  expect(result.skillCount).toBe(1);
  expect(result.groups.flatMap(({ skills }) => skills.map(({ skill }) => skill.id))).toEqual(["mixed"]);
});

it("puts shared first and dedupes aliases within one owner", () => {
  const result = createAgentSkillProjection([
    skill({
      sourceSightings: [
        sighting("user", "shared", "공유 디렉터리", "/Users/me/.agents/skills", "shared"),
        sighting("admin", "shared", "공유 디렉터리", "/Users/me/.config/agents/skills", "shared"),
      ],
    }),
  ]);

  expect(result.groups[0]?.owner.id).toBe("shared");
  expect(result.groups[0]?.skills[0]?.aliases).toHaveLength(2);
});

it("merges project owners and aliases into one physical Skill entry", () => {
  const result = createProjectSkillProjection([
    skill({
      sourceSightings: [
        sighting("project", "claude-code", "Claude Code", "/Users/me/dev/app/.claude/skills"),
        sighting("project", "cursor", "Cursor", "/Users/me/dev/app/.cursor/skills"),
      ],
    }),
  ]);

  expect(result.skillCount).toBe(1);
  expect(result.groups[0]?.directory).toBe("/Users/me/dev/app");
  expect(result.groups[0]?.skills).toHaveLength(1);
  expect(result.groups[0]?.skills[0]?.owners.map(({ name }) => name)).toEqual(["Claude Code", "Cursor"]);
});

it("derives marker and plain workspace project directories", () => {
  expect(inferProjectDirectory("/Users/me/dev/app/.agents/skills")).toBe("/Users/me/dev/app");
  expect(inferProjectDirectory("/Users/me/dev/app/.roo/skills-debug")).toBe("/Users/me/dev/app");
  expect(inferProjectDirectory("/Users/me/workspace/skills")).toBe("/Users/me/workspace");
  expect(inferProjectDirectory("relative/.claude/skills")).toBeUndefined();
});

it("uses full-mode fallback without mixing project records into agents", () => {
  const project = skill({
    id: "fallback-project",
    kind: "project/source-local",
    skillsRoot: "/Users/me/dev/app/.claude/skills",
    configRoot: "/Users/me/dev/app/.claude",
    sourceSightings: [],
  });
  expect(createAgentSkillProjection([project]).skillCount).toBe(0);
  expect(createProjectSkillProjection([project]).groups[0]?.directory).toBe("/Users/me/dev/app");
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/lib/dashboard/skill-views.test.ts
```

Expected: FAIL because `./skill-views` does not exist.

- [x] **Step 3: Implement projection types and path inference**

Create `skill-views.ts` with:

```ts
const PROJECT_MARKERS = new Set([
  ".agent", ".agents", ".claude", ".cline", ".clinerules", ".codex", ".copilot",
  ".crush", ".cursor", ".factory", ".gemini", ".github", ".goose", ".grok",
  ".jcode", ".kilo", ".kimi-code", ".kiro", ".mimocode", ".mux", ".opencode",
  ".pi", ".qwen", ".roo", ".warp", ".zcode",
]);

export function inferProjectDirectory(skillsRoot: string, configRoot?: string): string | undefined {
  for (const candidate of [skillsRoot, configRoot]) {
    if (!candidate?.startsWith("/")) continue;
    const parts = candidate.replace(/\/+$/, "").split("/");
    const markerIndex = parts.findLastIndex((part) => PROJECT_MARKERS.has(part));
    if (markerIndex > 1) return parts.slice(0, markerIndex).join("/");
    if (parts.at(-1) === "skills" && parts.length > 2) return parts.slice(0, -1).join("/");
  }
  return undefined;
}
```

Use `${record.device}:${record.inode}` as the physical key. Build map keys as `${owner.id}\0${physicalKey}` for Agent entries and `${directory}\0${physicalKey}` for Project entries. Deduplicate aliases by `${owner.id}\0${path}`, owners by `owner.id`, and sort with `localeCompare(..., "ko", { numeric: true, sensitivity: "base" })` plus raw-string tie breakers. Use a stable fallback owner ID derived from `record.agent`; map `Shared agent skills` and `공유 디렉터리` to the shared owner.

- [x] **Step 4: Run focused tests and diagnostics**

Run:

```bash
npm test -- src/lib/dashboard/skill-views.test.ts
npm run check
```

Expected: projection tests PASS and Astro diagnostics report 0 errors/warnings/hints.

- [x] **Step 5: Commit Task 1**

```bash
git add src/lib/dashboard/skill-views.ts src/lib/dashboard/skill-views.test.ts
git commit -m "feat(view): 에이전트·프로젝트 Skill 집계 추가"
```

### Task 2: Agent and Project panels

**Files:**
- Create: `src/components/dashboard/AgentSkillsPanel.tsx`
- Create: `src/components/dashboard/ProjectSkillsPanel.tsx`
- Modify: `src/components/dashboard/SkillDashboard.tsx`
- Modify: `src/components/dashboard/SkillDashboard.test.tsx`
- Modify: `src/components/dashboard/dashboard.css`

**Interfaces:**
- Consumes `AgentSkillProjection`, `ProjectSkillProjection`, `AgentSkillGroup`, `ProjectSkillGroup` from Task 1.
- Both panels receive `onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void` and do not own dialog state.

- [x] **Step 1: Write failing dashboard tab tests**

Add a fixture containing:

- one Claude global Skill with a project alias,
- one project-only Skill with Claude and Cursor project sightings,
- one `skills.md` document.

Assert:

```ts
expect(await screen.findByRole("button", { name: "에이전트 1" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "프로젝트 2" })).toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: "에이전트 1" }));
expect(screen.getByRole("heading", { name: "Claude Code" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /global-skill.*상세 보기/ })).toBeInTheDocument();
expect(screen.queryByText("project-only")).not.toBeInTheDocument();
expect(screen.queryByText("document-only")).not.toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: "프로젝트 1" }));
const project = screen.getByRole("heading", { name: "app" }).closest("article")!;
expect(within(project).getByText("/Users/me/dev/app")).toBeInTheDocument();
expect(within(project).getAllByText("project-only")).toHaveLength(1);
expect(within(project).getByText("Claude Code")).toBeInTheDocument();
expect(within(project).getByText("Cursor")).toBeInTheDocument();
```

Click the project Skill detail trigger, close with Escape, and assert the trigger regains focus.

- [x] **Step 2: Run dashboard test and verify RED**

Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx
```

Expected: FAIL because the `에이전트` and `프로젝트` tabs do not exist.

- [x] **Step 3: Implement the Agent panel**

Create `AgentSkillsPanel.tsx` with this structure:

```tsx
import { For, Show } from "solid-js";
import type { AgentSkillProjection } from "../../lib/dashboard/skill-views";
import type { SkillRecord } from "../../lib/inventory/types";

interface Props {
  projection: AgentSkillProjection;
  onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void;
}

export function AgentSkillsPanel(props: Props) {
  return (
    <section class="taxonomy-panel agent-skills" aria-labelledby="agent-skills-title">
      <header class="taxonomy-heading">
        <div>
          <p class="section-kicker">NON-PROJECT SKILLS</p>
          <h2 id="agent-skills-title">에이전트 Skill</h2>
          <p>프로젝트 경로를 제외한 SKILL.md {props.projection.skillCount.toLocaleString("ko-KR")}개</p>
        </div>
      </header>
      <Show when={props.projection.groups.length > 0} fallback={<div class="taxonomy-empty">프로젝트를 제외한 Skill이 없습니다.</div>}>
        <div class="taxonomy-group-list">
          <For each={props.projection.groups}>{(group) => (
            <article class="agent-skill-group" classList={{ "is-shared-owner": group.owner.type === "shared" }}>
              <header><h3>{group.owner.name}</h3><span>{group.skills.length.toLocaleString("ko-KR")} SKILLS</span></header>
              <ul class="taxonomy-skill-list">
                <For each={group.skills}>{(entry) => (
                  <li>
                    <button type="button" aria-label={`${entry.skill.name} · ${group.owner.name} · ${entry.aliases[0]?.path ?? entry.skill.path} 상세 보기`} onClick={(event) => props.onSelect(entry.skill, event.currentTarget)}>
                      <strong>{entry.skill.name}</strong>
                      <span>{entry.skill.description || "설명 없음"}</span>
                    </button>
                    <ul class="taxonomy-alias-list">
                      <For each={entry.aliases}>{(alias) => <li><code>{alias.path}</code></li>}</For>
                    </ul>
                  </li>
                )}</For>
              </ul>
            </article>
          )}</For>
        </div>
      </Show>
    </section>
  );
}
```

- [x] **Step 4: Implement the Project panel**

Create `ProjectSkillsPanel.tsx` with project `<article>` elements:

```tsx
import { For, Show } from "solid-js";
import type { ProjectSkillProjection } from "../../lib/dashboard/skill-views";
import type { SkillRecord } from "../../lib/inventory/types";

interface Props {
  projection: ProjectSkillProjection;
  onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void;
}
const pathLeaf = (value: string) => value.replace(/\/+$/, "").split("/").at(-1) || value;

export function ProjectSkillsPanel(props: Props) {
  return (
    <section class="taxonomy-panel project-skills" aria-labelledby="project-skills-title">
      <header class="taxonomy-heading"><div><p class="section-kicker">PROJECT DIRECTORY INDEX</p><h2 id="project-skills-title">프로젝트 Skill</h2><p>{props.projection.groups.length.toLocaleString("ko-KR")}개 dir · {props.projection.skillCount.toLocaleString("ko-KR")}개 Skill</p></div></header>
      <Show when={props.projection.groups.length > 0} fallback={<div class="taxonomy-empty">프로젝트 Skill이 없습니다.</div>}>
        <div class="project-group-list">
          <For each={props.projection.groups}>{(group) => (
            <article class="project-skill-group">
              <header><div><h3>{pathLeaf(group.directory)}</h3><code>{group.directory}</code></div><span>{group.skills.length.toLocaleString("ko-KR")} SKILLS · {group.ownerCount.toLocaleString("ko-KR")} AGENTS</span></header>
              <ul class="taxonomy-skill-list">
                <For each={group.skills}>{(entry) => (
                  <li>
                    <button type="button" aria-label={`${entry.skill.name} · ${group.directory} 상세 보기`} onClick={(event) => props.onSelect(entry.skill, event.currentTarget)}><strong>{entry.skill.name}</strong><span>{entry.skill.description || "설명 없음"}</span></button>
                    <div class="owner-badges"><For each={entry.owners}>{(owner) => <span>{owner.name}</span>}</For></div>
                    <ul class="taxonomy-alias-list"><For each={entry.aliases}>{(alias) => <li><strong>{alias.owner.name}</strong><code>{alias.path}</code></li>}</For></ul>
                  </li>
                )}</For>
              </ul>
            </article>
          )}</For>
        </div>
      </Show>
    </section>
  );
}
```

- [x] **Step 5: Wire tabs, memos, counts, and selection**

In `SkillDashboard.tsx`:

```ts
const [view, setView] = createSignal<
  "skills" | "agents" | "projects" | "duplicates" | "links" | "sources"
>("skills");
const agentSkills = createMemo(() => createAgentSkillProjection(snapshot()?.skills ?? []));
const projectSkills = createMemo(() => createProjectSkillProjection(snapshot()?.skills ?? []));
```

Insert tabs after `Skill 파일`:

```tsx
<button aria-pressed={view() === "agents"} onClick={() => setView("agents")}>
  에이전트 <span>{agentSkills().skillCount.toLocaleString("ko-KR")}</span>
</button>
<button aria-pressed={view() === "projects"} onClick={() => setView("projects")}>
  프로젝트 <span>{projectSkills().skillCount.toLocaleString("ko-KR")}</span>
</button>
```

Add these `Match` branches and pass the existing detail callback:

```tsx
<Match when={view() === "agents"}>
  <AgentSkillsPanel projection={agentSkills()} onSelect={(skill, trigger) => { detailTrigger = trigger; setSelected(skill); }} />
</Match>
<Match when={view() === "projects"}>
  <ProjectSkillsPanel projection={projectSkills()} onSelect={(skill, trigger) => { detailTrigger = trigger; setSelected(skill); }} />
</Match>
```

- [x] **Step 6: Add responsive styling**

Add the following style families, preserving the existing horizontally scrollable mobile tab strip:

```css
.taxonomy-panel { padding: 2rem 0 3rem; }
.taxonomy-heading { padding-bottom: 1rem; border-bottom: 1px solid var(--ink); }
.taxonomy-heading h2 { margin-top: .35rem; font: 700 clamp(1.8rem, 3vw, 2.8rem)/1 var(--display); }
.taxonomy-heading p:last-child { margin-top: .5rem; color: var(--muted); font-size: .8rem; }
.taxonomy-group-list, .project-group-list { display: grid; }
.agent-skill-group, .project-skill-group { border-bottom: 1px solid var(--ink); }
.agent-skill-group > header, .project-skill-group > header { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 0 .75rem; }
.agent-skill-group.is-shared-owner { box-shadow: inset 3px 0 var(--accent); padding-left: .8rem; }
.taxonomy-skill-list, .taxonomy-alias-list { margin: 0; padding: 0; list-style: none; }
.taxonomy-skill-list > li { display: grid; grid-template-columns: minmax(12rem, .8fr) minmax(0, 1.2fr); gap: 1rem; padding: .85rem 0; border-top: 1px solid var(--line); }
.taxonomy-skill-list button { min-width: 0; display: grid; gap: .3rem; border: 0; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.taxonomy-skill-list button span { color: var(--muted); line-height: 1.4; }
.taxonomy-alias-list code, .project-skill-group > header code { overflow-wrap: anywhere; font: .63rem/1.4 var(--mono); }
.owner-badges { display: flex; flex-wrap: wrap; gap: .35rem; }
.owner-badges span { padding: .25rem .4rem; background: var(--accent-soft); color: var(--accent); font: 700 .58rem/1 var(--mono); }
.taxonomy-empty { min-height: 20rem; display: grid; place-items: center; color: var(--muted); }
@media (max-width: 760px) {
  .taxonomy-skill-list > li { grid-template-columns: 1fr; gap: .65rem; }
  .agent-skill-group > header, .project-skill-group > header { align-items: flex-start; flex-direction: column; }
}
```

- [x] **Step 7: Run focused and full UI tests**

Run:

```bash
npm test -- src/lib/dashboard/skill-views.test.ts src/components/dashboard/SkillDashboard.test.tsx
npm test
npm run check
```

Expected: all tests PASS and diagnostics remain zero.

- [x] **Step 8: Commit Task 2**

```bash
git add src/components/dashboard/AgentSkillsPanel.tsx \
  src/components/dashboard/ProjectSkillsPanel.tsx \
  src/components/dashboard/SkillDashboard.tsx \
  src/components/dashboard/SkillDashboard.test.tsx \
  src/components/dashboard/dashboard.css
git commit -m "feat(ui): 에이전트·프로젝트 Skill 탭 추가"
```

### Task 3: Documentation and initial real-data QA

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-18-agent-project-skill-views.md`

- [x] **Step 1: Document both projections**

Document Agent exclusion, Project physical merge, and full-mode fallback in `README.md`.

- [x] **Step 2: Run real snapshot invariant smoke**

Verify official/full Agent eligibility and unique `(project dir, device, inode)` memberships against production API snapshots.

- [x] **Step 3: Run desktop and 390px browser QA**

Verify six tabs, badge counts, scope exclusion, merged project owners, detail focus restoration, and document-width overflow.

- [x] **Step 4: Commit Task 3**

```bash
git add README.md docs/superpowers/plans/2026-07-18-agent-project-skill-views.md
git commit -m "docs(readme): Skill 분류 탭 사용법 추가"
```

### Task 4: Collapsible owner and project groups

**Files:**
- Modify: `src/components/dashboard/AgentSkillsPanel.tsx`
- Modify: `src/components/dashboard/ProjectSkillsPanel.tsx`
- Modify: `src/components/dashboard/SkillDashboard.test.tsx`
- Modify: `src/components/dashboard/dashboard.css`
- Modify: `README.md`

**Interfaces:**
- Keeps panel props and projection contracts unchanged.
- Replaces each group wrapper/header with native closed-by-default `<details>/<summary>`.

- [ ] **Step 1: Write failing collapse tests**

Extend the dashboard test after opening each tab:

```ts
fireEvent.click(screen.getByRole("button", { name: "에이전트 1" }));
const agentToggle = screen.getByRole("button", { name: "Claude Code Skill 목록 토글" });
const agentGroup = agentToggle.closest("details")!;
expect(agentGroup).not.toHaveAttribute("open");
expect(screen.queryByRole("button", { name: /global-skill.*상세 보기/ })).not.toBeInTheDocument();
fireEvent.click(agentToggle);
expect(agentGroup).toHaveAttribute("open");
expect(screen.getByRole("button", { name: /global-skill.*상세 보기/ })).toBeInTheDocument();
fireEvent.click(agentToggle);
expect(agentGroup).not.toHaveAttribute("open");

fireEvent.click(screen.getByRole("button", { name: "프로젝트 2" }));
const projectToggle = screen.getByRole("button", { name: "app 프로젝트 Skill 목록 토글" });
const projectGroup = projectToggle.closest("details")!;
expect(projectGroup).not.toHaveAttribute("open");
fireEvent.click(projectToggle);
expect(projectGroup).toHaveAttribute("open");
expect(within(projectGroup).getByRole("button", { name: /project-only.*상세 보기/ })).toBeInTheDocument();
```

- [ ] **Step 2: Run dashboard tests and verify RED**

Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx
```

Expected: FAIL because owner/project group toggles do not exist and Skill rows are visible immediately.

- [ ] **Step 3: Implement native group toggles**

In both panels, replace each group `<article>` with `<details>` and its direct `<header>` with the first-child `<summary>`. Add an accessible label:

```tsx
<details class="agent-skill-group" classList={{ "is-shared-owner": group.owner.type === "shared" }}>
  <summary aria-label={`${group.owner.name} Skill 목록 토글`}>
    <h3>{group.owner.name}</h3>
    <span>{group.skills.length.toLocaleString("ko-KR")} SKILLS</span>
  </summary>
  <ul class="taxonomy-skill-list">...</ul>
</details>
```

```tsx
<details class="project-skill-group">
  <summary aria-label={`${pathLeaf(group.directory)} 프로젝트 Skill 목록 토글`}>
    <div><h3>{pathLeaf(group.directory)}</h3><code>{group.directory}</code></div>
    <span>{group.skills.length.toLocaleString("ko-KR")} SKILLS · {group.ownerCount.toLocaleString("ko-KR")} AGENTS</span>
  </summary>
  <ul class="taxonomy-skill-list">...</ul>
</details>
```

Do not set the `open` attribute, so every group starts collapsed.

- [ ] **Step 4: Style summary state without custom JS**

Change group header selectors to `> summary`, remove the native marker, reserve a right-side state cell, and use CSS state labels:

```css
.agent-skill-group > summary, .project-skill-group > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 1rem;
  align-items: start;
  padding: 1rem 0 .75rem;
  cursor: pointer;
  list-style: none;
}
.agent-skill-group > summary::-webkit-details-marker,
.project-skill-group > summary::-webkit-details-marker { display: none; }
.agent-skill-group > summary::after,
.project-skill-group > summary::after { content: "+"; color: var(--accent); font: 700 1rem/1 var(--mono); }
.agent-skill-group[open] > summary::after,
.project-skill-group[open] > summary::after { content: "−"; }
.agent-skill-group > summary:focus-visible,
.project-skill-group > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 760px) {
  .agent-skill-group > summary, .project-skill-group > summary { grid-template-columns: minmax(0, 1fr) auto; }
  .agent-skill-group > summary > span, .project-skill-group > summary > span { grid-column: 1; }
  .agent-skill-group > summary::after, .project-skill-group > summary::after { grid-column: 2; grid-row: 1; }
}
```

- [ ] **Step 5: Document and verify**

Add to README that Agent owner groups and Project dir groups start collapsed and expand independently. Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx
npm test
npm run check
git diff --check
```

Expected: all 94+ tests pass and diagnostics are zero.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/components/dashboard/AgentSkillsPanel.tsx \
  src/components/dashboard/ProjectSkillsPanel.tsx \
  src/components/dashboard/SkillDashboard.test.tsx \
  src/components/dashboard/dashboard.css README.md
git commit -m "feat(ui): Skill 그룹 접기·펼치기 추가"
```

### Task 5: Final review, browser QA, and verification

- [ ] **Step 1: Request independent review and remediate**

Review the complete feature for scope correctness, physical dedupe, fallback false positives, native details accessibility, deterministic ordering, and mobile wrapping. Fix every Critical/Important finding with a regression test.

- [ ] **Step 2: Run live collapse QA**

At desktop and 390px verify all groups start closed, Agent/Project summaries independently toggle, detail opens from an expanded group and restores focus, and `document.documentElement.scrollWidth === innerWidth`.

- [ ] **Step 3: Mark plan complete and verify**

Run:

```bash
npm run verify
git diff --check
```

Expected: Vitest, Astro check, and production build pass.

- [ ] **Step 4: Commit final plan state**

```bash
git add docs/superpowers/specs/2026-07-18-agent-project-skill-views-design.md \
  docs/superpowers/plans/2026-07-18-agent-project-skill-views.md
git commit -m "docs(plan): Skill 분류 보기 구현 완료 표시"
test -z "$(git status --porcelain)"
```
