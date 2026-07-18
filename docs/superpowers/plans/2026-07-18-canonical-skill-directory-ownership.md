# Canonical Skill Directory Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공식 scan coverage를 유지하면서 각 Skill 디렉터리를 단일 vendor owner 또는 공유 디렉터리에만 귀속한다.

**Architecture:** 기존 client별 root relation은 path union 생성에 남기고, 각 root definition에 별도 `ownerId`를 부여한다. 첫 task는 기존 API shape를 유지한 채 registry ownership projection을 추가하고, 두 번째 task가 discovery·API types·Solid UI를 한 번에 owner-only shape로 전환해 각 commit을 buildable하게 유지한다.

**Tech Stack:** Astro 7 SSR, Solid.js 1.9, TypeScript 6, Node.js filesystem APIs, Vitest 4, Solid Testing Library

## Global Constraints

- `~/.agents/skills`와 `**/.agents/skills`는 `공유 디렉터리` 소유다.
- vendor namespace는 scope와 호환 소비자 수와 관계없이 해당 vendor 하나가 소유한다.
- 호환 relation은 scan path union에 남기되 최종 API·UI·상세에 노출하지 않는다.
- 소유 경로가 없는 Zed와 Sakana Fugu는 공식 소스 agent 목록에서 제외한다.
- official/full mode의 발견 Skill 물리 identity 집합과 record 수를 유지한다.
- inode dedupe, symlink/size/race 방어, mode cache와 상세 allowlist를 변경하지 않는다.

---

## File Map

- Modify: `src/lib/inventory/types.ts` — public owner/shared response types.
- Modify: `src/lib/inventory/official-sources.ts` — root relation owner ID, ownership aggregation, owner-only summaries.
- Modify: `src/lib/inventory/official-sources.test.ts` — exact ownership and hidden-agent tests.
- Modify: `src/lib/inventory/official-discovery.ts` — owner-based roots and sightings.
- Modify: `src/lib/inventory/official-discovery.test.ts` — scan parity and owner serialization tests.
- Modify: `src/components/dashboard/OfficialSourcesPanel.tsx` — shared-first owner ledger.
- Modify: `src/components/dashboard/SkillDetail.tsx` — owner-only sighting metadata.
- Modify: `src/components/dashboard/SkillDashboard.tsx` — source owner group badge.
- Modify: `src/components/dashboard/SkillDashboard.test.tsx` — shared, vendor, detail, mode regression tests.
- Modify: `src/components/dashboard/dashboard.css` — shared row styling without compatibility labels.
- Modify: `README.md` — canonical ownership explanation.

### Task 1: Registry ownership projection without API migration

**Files:**
- Modify: `src/lib/inventory/types.ts`
- Modify: `src/lib/inventory/official-sources.ts`
- Modify: `src/lib/inventory/official-sources.test.ts`

**Interfaces:**
- Adds: `OfficialSourceOwner { id, name, type }`
- Adds: `OfficialSharedSource { id: "shared", name: "공유 디렉터리", globalPaths, projectPaths }`
- Adds: `ResolvedOfficialRegistry.shared`
- Adds: `owner` to internal resolved root candidates, patterns, and root matches
- Keeps temporarily: current public root/sighting `agents[]` and `kinds[]` so discovery/UI remain buildable until Task 2

- [x] **Step 1: Write failing owner tests**

```ts
const registry = resolveOfficialRegistry("/Users/me", {});
expect(registry.shared.globalPaths).toContain("/Users/me/.agents/skills");
expect(agent(registry, "cursor").globalPaths).toEqual(["/Users/me/.cursor/skills"]);
expect(registry.agents.map(({ id }) => id)).not.toEqual(
  expect.arrayContaining(["zed", "sakana-fugu"]),
);
expect(matchOfficialRoot("/Users/me/dev/app/.claude/skills", registry, {
  workspaceMarker: false,
})).toMatchObject({ owner: { id: "claude-code", name: "Claude Code", type: "agent" } });
expect(matchOfficialRoot("/Users/me/dev/app/.agents/skills", registry, {
  workspaceMarker: false,
})).toMatchObject({ owner: { id: "shared", name: "공유 디렉터리", type: "shared" } });
expect(matchOfficialRoot("/Users/me/dev/app/.codex/skills", registry, {
  workspaceMarker: false,
})).toMatchObject({ owner: { id: "codex", name: "Codex CLI", type: "agent" } });
```

- [x] **Step 2: Verify owner tests fail against the multi-agent model**

Run: `npm test -- src/lib/inventory/official-sources.test.ts`

Expected: FAIL because `shared` and `owner` do not exist and Cursor still lists compatibility paths.

- [x] **Step 3: Add owner IDs to root definitions**

Each fixed/pattern definition receives `ownerId`. Native definitions default to the declaring agent; shared helpers use `shared`; compatibility helpers explicitly name the namespace owner.

```ts
const sharedUser = () => fixedHome(".agents/skills", "shared", "shared");
const claudeUserCompatibility = () =>
  fixedHome(".claude/skills", "compatibility", "claude-code");
projectRoot(".codex/skills", "compatibility", { ownerId: "codex" });
projectRoot(".agent/skills", "compatibility", { ownerId: "antigravity" });
```

- [x] **Step 4: Resolve scan relations and ownership separately**

Keep existing relation `kinds/agents` internally for Task 1 compatibility, but assign one `owner` to every aggregate. Reject conflicting owner IDs. Build `registry.agents` from paths owned by each agent, build `registry.shared` separately, and omit owner agents with no paths.

- [x] **Step 5: Run registry and full diagnostics**

Run:

```bash
npm test -- src/lib/inventory/official-sources.test.ts
npm run check
npm test
```

Expected: registry ownership tests and all existing tests PASS while the serialized snapshot remains unchanged.

- [x] **Step 6: Commit Task 1**

```bash
git add src/lib/inventory/types.ts src/lib/inventory/official-sources.ts src/lib/inventory/official-sources.test.ts
git commit -m "refactor(scan): Skill 경로 단일 소유권 projection 추가"
```

### Task 2: Atomic owner-only snapshot and UI migration

**Files:**
- Modify: `src/lib/inventory/types.ts`
- Modify: `src/lib/inventory/official-discovery.ts`
- Modify: `src/lib/inventory/official-discovery.test.ts`
- Modify: `src/components/dashboard/OfficialSourcesPanel.tsx`
- Modify: `src/components/dashboard/SkillDetail.tsx`
- Modify: `src/components/dashboard/SkillDashboard.tsx`
- Modify: `src/components/dashboard/SkillDashboard.test.tsx`
- Modify: `src/components/dashboard/dashboard.css`

**Interfaces:**
- Changes: `SkillSourceSighting` from `agents/kinds` to `owner`
- Changes: `OfficialSourceRoot` from `agents/kinds` to `owner`
- Changes: `OfficialSourceSummary` to `{ shared, agents, roots }`
- Removes: public `OfficialSourceKind`
- Displays: one shared row followed by owned agent rows

- [x] **Step 1: Write failing discovery owner/parity tests**

Create fixture roots for `.agents/skills`, `.claude/skills`, and compatibility-only project `.codex/skills`. Assert owners `shared`, `claude-code`, and `codex`; assert every fixture physical file remains present once.

```ts
expect(snapshot.skills.find(({ name }) => name === "shared")?.sourceSightings[0]?.owner.id)
  .toBe("shared");
expect(snapshot.skills.find(({ name }) => name === "claude")?.sourceSightings[0]?.owner.id)
  .toBe("claude-code");
expect(snapshot.skills.find(({ name }) => name === "codex-compat")?.sourceSightings[0]?.owner.id)
  .toBe("codex");
```

- [x] **Step 2: Write failing dashboard owner tests**

Update the dashboard fixture to the wished-for owner shape. Assert the shared row appears once, Claude owns `.claude`, Cursor compatibility is absent, the source badge counts owner groups, and detail says `Claude Code · 사용자` without compatibility text.

- [x] **Step 3: Verify new tests fail on the current serialized shape**

Run:

```bash
npm test -- src/lib/inventory/official-discovery.test.ts src/components/dashboard/SkillDashboard.test.tsx
```

Expected: FAIL because roots/sightings still expose relation arrays and the panel has no shared row.

- [x] **Step 4: Migrate public response types and discovery**

Remove public relation arrays, add required summary `shared`, copy `match.owner` into roots and sightings, reject owner conflicts in root merge, and dedupe sightings by owner ID. Official records use `primary.owner.name`, including `공유 디렉터리`. Full annotation uses the same owner path.

- [x] **Step 5: Implement shared-first source ledger**

Render `summary.shared` first without a documentation link, then owned agents. Filter roots by `root.owner.id`, count each root once, remove compatibility labels, and preserve semantic sections/lists, absolute path wrapping, and safe external links.

- [x] **Step 6: Simplify detail and source badge**

Detail renders owner name, scope, and alias path. Dashboard source badge counts `summary.agents.length + 1` when shared paths exist.

- [x] **Step 7: Update responsive styling and all fixtures**

Add a shared-row marker, remove obsolete kind text, preserve 390px wrapping, and update scanner/store/dashboard fixtures to include `{ shared, agents, roots }`.

- [x] **Step 8: Run focused and complete verification**

Run:

```bash
npm test -- src/lib/inventory/official-sources.test.ts src/lib/inventory/official-discovery.test.ts src/components/dashboard/SkillDashboard.test.tsx
npm run verify
git diff --check
```

Expected: ownership, alias, mode, security, UI tests PASS; Astro diagnostics zero; production build succeeds.

- [x] **Step 9: Commit Task 2**

```bash
git add src/lib/inventory src/components/dashboard
git commit -m "refactor(ui): 공식 Skill 소스를 단일 소유자별로 표시"
```

### Task 3: Documentation, real QA, and independent review

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-18-canonical-skill-directory-ownership.md`

- [x] **Step 1: Document canonical ownership**

Explain that scan compatibility remains internal, `.agents/skills` is shared, vendor roots appear only under their owner, and ownerless clients are omitted from the source ledger.

- [x] **Step 2: Run real API parity smoke**

Restart the built server and assert official mode returns owner-only roots, no `.claude` root has an owner other than `claude-code`, exact `.agents/skills` roots use `shared`, and full mode still returns records.

- [x] **Step 3: Run desktop and 390px browser QA**

Verify one shared row, no repeated `.claude/skills` under Cursor/OpenCode, owner group badge, owner-only detail aliases, Escape focus restoration, and no horizontal overflow.

- [x] **Step 4: Request independent review and remediate**

Review the feature range for scan coverage parity, ownership conflicts, API shape consistency, accessible source grouping, and hidden compatibility data. Fix every Critical/Important finding with a failing test first.

- [x] **Step 5: Re-run final verification and mark plan complete**

Run:

```bash
npm run verify
git diff --check
test -z "$(git status --porcelain)"
```

Expected: complete suite PASS after review remediation and a clean worktree after the final documentation commit.
