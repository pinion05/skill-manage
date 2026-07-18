# Official Skill Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공식 문서로 확인된 코딩 에이전트 Skill 경로를 기본 검색 범위로 제공하고, 전체 파일시스템 검색을 별도 mode로 유지한다.

**Architecture:** 정적 first-party registry를 순수 데이터로 유지하고, 별도 discovery 계층이 환경변수 기반 전역 root와 홈 전체의 공식 project suffix를 수집한다. official scanner는 root·file identity로 물리 중복을 합치면서 모든 lexical sighting을 보존하고, mode-aware store/API가 독립 snapshot을 제공한다. Solid dashboard는 공식 mode를 기본값으로 사용하고 provenance ledger와 상세 alias를 렌더링한다.

**Tech Stack:** Astro 7 SSR, Solid.js 1.9, TypeScript 6, Node.js filesystem APIs, Vitest 4, Solid Testing Library

## Global Constraints

- 기본 scan mode는 `official`; `full`은 명시적 사용자 선택이다.
- 공식 문서 또는 공식 저장소에서 정확한 Skill root가 확인된 agent/path만 registry에 넣는다.
- 사용자 전역 경로와 홈 아래 모든 프로젝트의 공식 suffix를 검색한다.
- 세션·대화·cache·dependency 경로를 프로젝트 공식 root discovery에서 제외한다.
- 동일한 물리 파일은 한 record로 합치되 모든 alias와 agent sighting을 보존한다.
- 같은 이름이지만 다른 물리 파일은 합치지 않는다.
- mode별 snapshot과 in-flight Promise를 분리한다.
- 상세 본문은 요청 mode의 현재 snapshot ID allowlist에서만 읽는다.
- 기존 읽기 전용 filesystem 및 HTTP 보안 경계를 유지한다.
- unsupported/unverified agent는 UI에 표시하지 않는다.

---

## File Map

- Create: `src/lib/inventory/official-sources.ts` — first-party agent/path registry, env expansion, path matching.
- Create: `src/lib/inventory/official-sources.test.ts` — registry evidence, env, unsupported exclusion tests.
- Create: `src/lib/inventory/official-discovery.ts` — bounded home traversal, root resolution, physical dedupe, full annotation.
- Create: `src/lib/inventory/official-discovery.test.ts` — project discovery, pruning, alias/symlink tests.
- Create: `src/lib/inventory/scan-mode.ts` — mode parser and scanner dispatcher.
- Create: `src/lib/inventory/scan-mode.test.ts` — default/validation/dispatch tests.
- Modify: `src/lib/inventory/types.ts` — mode, source, sighting response types.
- Modify: `src/lib/inventory/scanner.ts` — mode metadata defaults and safe opt-in directory-link traversal.
- Modify: `src/lib/inventory/scanner.test.ts` — symlink directory cycle and official traversal seams.
- Modify: `src/lib/inventory/store.ts` — mode-keyed snapshot, in-flight scan, content allowlist.
- Modify: `src/lib/inventory/store.test.ts` — mode isolation and content tests.
- Modify: `src/pages/api/inventory/index.ts` — GET mode parsing.
- Modify: `src/pages/api/inventory/refresh.ts` — POST mode parsing.
- Modify: `src/pages/api/skills/content.ts` — content mode parsing.
- Create: `src/pages/api/inventory/routes.test.ts` — invalid mode 400 regression tests.
- Create: `src/components/dashboard/OfficialSourcesPanel.tsx` — provenance ledger.
- Modify: `src/components/dashboard/SkillDashboard.tsx` — mode control, mode URLs, source tab.
- Modify: `src/components/dashboard/SkillDetail.tsx` — mode-aware content URL and alias list.
- Modify: `src/components/dashboard/SkillDashboard.test.tsx` — default mode, switching, source/detail behavior.
- Modify: `src/components/dashboard/dashboard.css` — responsive mode and source ledger styles.
- Modify: `README.md` — default official scope and explicit full scan documentation.

### Task 1: Source types and first-party registry

**Files:**
- Modify: `src/lib/inventory/types.ts`
- Create: `src/lib/inventory/official-sources.ts`
- Create: `src/lib/inventory/official-sources.test.ts`

**Interfaces:**
- Produces: `ScanMode`, `OfficialSourceScope`, `OfficialSourceKind`
- Produces: `SkillSourceSighting`, `OfficialAgentSource`, `OfficialSourceRoot`, `OfficialSourceSummary`
- Produces: `OFFICIAL_AGENT_DEFINITIONS`
- Produces: `resolveOfficialRegistry(home, environment)`
- Produces: `matchOfficialRoot(rootPath, home, environment)`

- [ ] **Step 1: Write failing registry tests**

Create `official-sources.test.ts` with assertions that Claude uses `CLAUDE_CONFIG_DIR`, Codex retains `$HOME/.agents/skills`, `$CODEX_HOME/skills`, and `/etc/codex/skills`, Pi uses `PI_CODING_AGENT_DIR`, Qwen does not gain an unverified `.agents` root, and unsupported names are absent.

```ts
const registry = resolveOfficialRegistry("/Users/me", {
  CLAUDE_CONFIG_DIR: "/tmp/claude",
  CODEX_HOME: "/tmp/codex",
  PI_CODING_AGENT_DIR: "/tmp/pi",
});
expect(agent(registry, "claude-code").globalPaths).toContain("/tmp/claude/skills");
expect(agent(registry, "codex").globalPaths).toEqual(expect.arrayContaining([
  "/Users/me/.agents/skills",
  "/tmp/codex/skills",
  "/etc/codex/skills",
]));
expect(agent(registry, "pi").globalPaths).toContain("/tmp/pi/skills");
expect(agent(registry, "qwen").globalPaths).not.toContain("/Users/me/.agents/skills");
expect(registry.agents.map(({ id }) => id)).not.toContain("devin");
```

- [ ] **Step 2: Verify the registry test fails for the missing module**

Run: `npm test -- src/lib/inventory/official-sources.test.ts`

Expected: FAIL because `official-sources.ts` does not exist.

- [ ] **Step 3: Add source response types**

Extend `types.ts` with the approved interfaces and add required fields:

```ts
export interface SkillRecord {
  // existing fields
  sourceSightings: SkillSourceSighting[];
}

export interface InventorySnapshot {
  scanMode: ScanMode;
  officialSources: OfficialSourceSummary;
  // existing fields
}
```

- [ ] **Step 4: Implement the registry and pure expansion/matching helpers**

Represent every root relation with `kind`, documented display path, and either a fixed global resolver or a project suffix pattern. Aggregate duplicate physical spellings by lexical root while preserving all agent relations. Include only the products and paths listed in `docs/superpowers/specs/2026-07-18-official-skill-sources-design.md`.

- [ ] **Step 5: Run registry tests and type-aware existing tests**

Run: `npm test -- src/lib/inventory/official-sources.test.ts src/lib/inventory/store.test.ts src/components/dashboard/SkillDashboard.test.tsx`

Expected: registry assertions PASS; existing fixtures may initially report missing required fields, then PASS after adding `sourceSightings`, `scanMode`, and empty `officialSources` to fixture builders.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/inventory/types.ts src/lib/inventory/official-sources.ts src/lib/inventory/official-sources.test.ts src/lib/inventory/store.test.ts src/components/dashboard/SkillDashboard.test.tsx
git commit -m "feat(scan): 공식 Skill 소스 registry 추가"
```

### Task 2: Official root discovery and physical deduplication

**Files:**
- Create: `src/lib/inventory/official-discovery.ts`
- Create: `src/lib/inventory/official-discovery.test.ts`
- Modify: `src/lib/inventory/scanner.ts`
- Modify: `src/lib/inventory/scanner.test.ts`

**Interfaces:**
- Consumes: resolved registry from Task 1
- Produces: `discoverOfficialRoots(options): Promise<OfficialRootDiscovery>`
- Produces: `scanOfficialInventory(options?): Promise<InventorySnapshot>`
- Produces: `annotateFullInventory(snapshot, options?): Promise<InventorySnapshot>`
- Extends: `ScanOptions.followDirectoryLinks`

- [ ] **Step 1: Write failing discovery tests**

Build a temporary home containing global `.claude/skills`, two nested projects with `.agents/skills` and `.factory/skills`, excluded `node_modules/.agents/skills`, excluded `.claude/projects/.../.agents/skills`, and a root symlink to a shared directory. Assert that official discovery finds only allowed roots and reports missing fixed globals without aborting.

Add a second test with two official roots symlinked to the same target and two child skill symlinks to one physical `SKILL.md`:

```ts
const snapshot = await scanOfficialInventory({ home, roots: [home], environment: {} });
expect(snapshot.scanMode).toBe("official");
expect(snapshot.skills.filter(({ name }) => name === "shared")).toHaveLength(1);
expect(snapshot.skills.find(({ name }) => name === "shared")!.sourceSightings.length).toBeGreaterThan(1);
expect(new Set(snapshot.skills.map(({ inode }) => inode)).size).toBe(snapshot.skills.length);
```

- [ ] **Step 2: Verify discovery tests fail for the missing implementation**

Run: `npm test -- src/lib/inventory/official-discovery.test.ts`

Expected: FAIL because `official-discovery.ts` does not exist.

- [ ] **Step 3: Add opt-in symlink directory traversal to the base scanner**

Add `followDirectoryLinks: boolean` defaulting to `false`. When enabled, enqueue only directory links whose target top-level contains a regular `SKILL.md`; collection or broad-root links remain diagnostics and are not expanded. Before processing any directory, claim `(st_dev, st_ino)` in a visited set so cycles and multiple aliases cannot create unbounded traversal. Apply a separate main traversal directory budget and continue recording link health through the existing `inspectLink` path.

- [ ] **Step 4: Verify scanner symlink behavior**

Add a scanner test where a skill directory symlink points to a target and another link points back to an already visited directory. Assert one skill record, finite completion, and both link diagnostics. Run:

`npm test -- src/lib/inventory/scanner.test.ts`

Expected: all scanner tests PASS and default full mode still does not follow links.

- [ ] **Step 5: Implement bounded official project discovery**

Walk only `home`, never arbitrary fixed roots, with queue concurrency and a directory budget. Match exact and documented wildcard suffixes from the registry. Keep ambiguous generic patterns such as OpenClaw `<workspace>/skills` display-only unless a product-specific workspace source is available; do not infer them from arbitrary Git repositories. Do not enqueue matched Skill roots. Prune dependency/build/cache/vendor/backup names and exact session/state roots derived from environment-aware client homes. Resolve each root with `lstat`/`realpath`/`stat`; retain missing globals as `exists: false` and sanitize errors.

- [ ] **Step 6: Implement official scan and full annotation**

Scan each unique canonical root identity once. Group `SkillRecord` values by `${device}:${inode}`, choose the first stable record, and add every lexical source path to `sourceSightings`. Populate each serialized root’s `skillCount`. `annotateFullInventory` must retain all full records while attaching matching official sightings and the official agent catalog.

- [ ] **Step 7: Run focused and regression tests**

Run:

```bash
npm test -- src/lib/inventory/official-discovery.test.ts src/lib/inventory/scanner.test.ts src/lib/inventory/markdown.test.ts
```

Expected: all focused filesystem and security tests PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/lib/inventory/official-discovery.ts src/lib/inventory/official-discovery.test.ts src/lib/inventory/scanner.ts src/lib/inventory/scanner.test.ts
git commit -m "feat(scan): 공식 경로 discovery와 alias dedupe 추가"
```

### Task 3: Mode-aware store and APIs

**Files:**
- Create: `src/lib/inventory/scan-mode.ts`
- Create: `src/lib/inventory/scan-mode.test.ts`
- Modify: `src/lib/inventory/store.ts`
- Modify: `src/lib/inventory/store.test.ts`
- Modify: `src/pages/api/inventory/index.ts`
- Modify: `src/pages/api/inventory/refresh.ts`
- Modify: `src/pages/api/skills/content.ts`
- Create: `src/pages/api/inventory/routes.test.ts`

**Interfaces:**
- Produces: `parseScanMode(value: string | null): ScanMode`
- Produces: `scanInventoryForMode(mode: ScanMode): Promise<InventorySnapshot>`
- Changes: `getInventory(mode?: ScanMode)`, `refreshInventory(mode?: ScanMode)`, `getSkillContent(id, mode?: ScanMode)`

- [ ] **Step 1: Write failing mode/store tests**

Assert missing mode resolves to `official`, invalid input throws `InvalidScanModeError`, concurrent requests share only the same mode’s Promise, refresh changes only that mode, and an ID from the full snapshot is rejected against the official snapshot.

```ts
const official = store.getInventory("official");
const full = store.getInventory("full");
expect(scan).toHaveBeenCalledTimes(2);
expect(scan).toHaveBeenNthCalledWith(1, "official");
expect(scan).toHaveBeenNthCalledWith(2, "full");
await expect(store.getSkillContent("full-only", "official")).rejects.toBeInstanceOf(SkillNotFoundError);
```

- [ ] **Step 2: Verify focused tests fail with the old signatures**

Run: `npm test -- src/lib/inventory/scan-mode.test.ts src/lib/inventory/store.test.ts`

Expected: FAIL because mode parser/dispatcher and mode-keyed store do not exist.

- [ ] **Step 3: Implement parser, dispatcher, and mode-keyed Maps**

`parseScanMode(null)` returns `official`; only exact `official` and `full` are accepted. Store `snapshots` and `inFlight` in `Map<ScanMode, ...>`. A failed refresh must preserve only that mode’s previous snapshot.

- [ ] **Step 4: Add API mode parsing and invalid-mode tests**

Routes read `url.searchParams.get("mode")` before scanning. `InvalidScanModeError` returns:

```ts
Response.json(
  { error: "검색 범위는 official 또는 full이어야 합니다." },
  { status: 400, headers: { "Cache-Control": "no-store" } },
);
```

Call route handlers with invalid URLs in `routes.test.ts` and assert status `400` without filesystem work.

- [ ] **Step 5: Run store/API tests**

Run:

```bash
npm test -- src/lib/inventory/scan-mode.test.ts src/lib/inventory/store.test.ts src/pages/api/inventory/routes.test.ts
```

Expected: all mode, cache, refresh, and validation tests PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/lib/inventory/scan-mode.ts src/lib/inventory/scan-mode.test.ts src/lib/inventory/store.ts src/lib/inventory/store.test.ts src/pages/api
git commit -m "feat(api): scan mode별 snapshot 제공"
```

### Task 4: Scan mode control, source ledger, and detail sightings

**Files:**
- Create: `src/components/dashboard/OfficialSourcesPanel.tsx`
- Modify: `src/components/dashboard/SkillDashboard.tsx`
- Modify: `src/components/dashboard/SkillDetail.tsx`
- Modify: `src/components/dashboard/SkillDashboard.test.tsx`
- Modify: `src/components/dashboard/dashboard.css`

**Interfaces:**
- Produces: `OfficialSourcesPanel({ summary })`
- Changes: `SkillDetail` receives `scanMode: ScanMode`
- Requests: `/api/inventory?mode=...`, `/api/inventory/refresh?mode=...`, `/api/skills/content?id=...&mode=...`

- [ ] **Step 1: Write failing dashboard tests**

Update the inventory fixture with `scanMode`, `officialSources`, and source sightings. Assert:

```tsx
expect(fetchMock).toHaveBeenCalledWith("/api/inventory?mode=official");
fireEvent.click(screen.getByRole("button", { name: "전체 파일시스템" }));
await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/inventory?mode=full"));
fireEvent.click(screen.getByRole("button", { name: /공식 소스/ }));
expect(screen.getByRole("link", { name: /Claude Code 공식 문서/ })).toHaveAttribute("href", "https://code.claude.com/docs/en/skills");
```

Open a detail record and assert every alias path and agent is visible; assert content fetch includes the current mode.

- [ ] **Step 2: Verify dashboard tests fail for missing controls and source tab**

Run: `npm test -- src/components/dashboard/SkillDashboard.test.tsx`

Expected: FAIL because mode controls, source tab, and mode-aware content URL are absent.

- [ ] **Step 3: Implement mode-keyed dashboard resource**

Use a `ScanMode` signal initialized to `official` as the Solid resource source. Switching mode clears the selected detail and current rendered snapshot before requesting the selected server cache. Refresh posts only the selected mode. Keep all existing filters and tabs scoped to the current snapshot.

- [ ] **Step 4: Implement the official source provenance ledger**

Render a ruled list, not a card grid. Each agent row contains name, first-party link with `target="_blank" rel="noreferrer noopener"`, global/project patterns, discovered root state, source kind, and Skill count. Include only `summary.agents` supplied by the verified registry.

- [ ] **Step 5: Add detail source sightings**

Pass `scanMode` to `SkillDetail`, append it to the content URL, and render `sourceSightings` under a heading `공식 소스 경로`. Keep existing canonical path copy, focus trap, Escape, and trigger focus restoration.

- [ ] **Step 6: Add responsive, keyboard-visible styles**

Extend the existing blueprint ledger system with `.scan-mode-control`, `.official-sources`, `.official-agent-row`, and `.source-sighting-list`. At 760px use one-column metadata and allow all paths to wrap with `overflow-wrap: anywhere`. Add `:focus-visible` affordances and a `prefers-reduced-motion` override for scan/row/panel animation.

- [ ] **Step 7: Run dashboard and complete component tests**

Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx src/lib/dashboard/duplicate-skills.test.ts src/lib/dashboard/filter.test.ts
```

Expected: mode, source, detail, duplicate, filter, focus, and refresh tests PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/components/dashboard
git commit -m "feat(ui): 공식 Skill 소스 검색 범위 추가"
```

### Task 5: Documentation, full verification, browser QA, and review

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-18-official-skill-sources.md`

- [ ] **Step 1: Update user documentation**

Document official mode as default, explicit full mode, environment-aware roots, home-wide project suffix discovery, source tab, physical dedupe, and the fact that unsupported paths are not guessed.

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
npm run verify
git diff --check
git status --short
```

Expected: every Vitest test PASS, Astro diagnostics report 0 errors/warnings/hints, production build exits 0, and only intended files are changed.

- [ ] **Step 3: Run production API smoke**

Start the built server on loopback and verify:

```bash
curl -fsS 'http://127.0.0.1:4321/api/inventory' | jq -e '.scanMode == "official"'
curl -fsS 'http://127.0.0.1:4321/api/inventory?mode=full' | jq -e '.scanMode == "full"'
curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:4321/api/inventory?mode=invalid'
```

Expected: official assertion true, full assertion true, invalid status `400`.

- [ ] **Step 4: Run browser QA at desktop and 390px**

Verify default official mode, explicit full switch, refresh URL/label, source agent/doc links, source counts, Skill detail aliases, no pagination, Escape focus restoration, and no horizontal overflow at 390px.

- [ ] **Step 5: Request independent review**

Review the feature range from the pre-feature commit through HEAD against this plan, focusing on first-party evidence fidelity, root discovery performance, symlink security, physical dedupe, mode cache isolation, accessibility, and full-mode regressions. Fix every Critical and Important issue with a failing regression test first.

- [ ] **Step 6: Re-run complete verification after review fixes**

Run: `npm run verify && git diff --check`

Expected: all tests/check/build PASS after remediation.

- [ ] **Step 7: Commit final documentation/remediation**

```bash
git add README.md docs/superpowers src
git commit -m "docs(readme): 공식 Skill 검색 범위 설명"
```
