# Unpaginated Skill Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검색·필터된 모든 skill record를 페이지 구분 없이 하나의 연속된 표에 렌더링한다.

**Architecture:** 기존 `applySkillQuery` 결과 배열을 잘라내지 않고 `SkillTable`에 그대로 전달한다. Dashboard와 Table의 pagination 상태·인터페이스·UI를 제거하고, scanner/API/detail/table semantics는 유지한다.

**Tech Stack:** Astro 7, Solid.js 1.9, TypeScript 6, Vitest 4, Solid Testing Library

## Global Constraints

- 약 2,253개 record를 가상 스크롤이나 무한 로딩 없이 즉시 DOM에 렌더링한다.
- 검색, 필터, 정렬, 상세 dialog, 모바일 table semantics, API, scanner 동작은 변경하지 않는다.
- 프로덕션 파일시스템 동작은 계속 읽기 전용이어야 한다.

---

## File Map

- `src/components/dashboard/SkillDashboard.test.tsx`: 50개 초과 결과 전체 렌더링 회귀 테스트.
- `src/components/dashboard/SkillDashboard.tsx`: page signal과 `paginate` 연결 제거.
- `src/components/dashboard/SkillTable.tsx`: 전체 배열 렌더링과 pagination navigation 제거.
- `src/components/dashboard/dashboard.css`: 사용하지 않는 pagination 스타일 제거.
- `src/lib/dashboard/filter.ts`: 사용하지 않는 `PageResult`와 `paginate` 제거.
- `src/lib/dashboard/filter.test.ts`: 폐기된 pagination 단위 테스트 제거.
- `README.md`: 전체 결과 원장 동작으로 기능 설명 갱신.
- `docs/superpowers/specs/2026-07-18-skill-inventory-poc-design.md`: 기존 pagination 요구를 새 승인 설계로 갱신.
- `docs/superpowers/plans/2026-07-18-skill-inventory-poc.md`: pagination 단계가 새 설계로 대체되었다는 이력 표시.

### Task 1: 전체 결과를 한 원장에 렌더링

**Files:**
- Modify: `src/components/dashboard/SkillDashboard.test.tsx`
- Modify: `src/components/dashboard/SkillDashboard.tsx`
- Modify: `src/components/dashboard/SkillTable.tsx`
- Modify: `src/components/dashboard/dashboard.css`
- Modify: `src/lib/dashboard/filter.ts`
- Modify: `src/lib/dashboard/filter.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-18-skill-inventory-poc-design.md`
- Modify: `docs/superpowers/plans/2026-07-18-skill-inventory-poc.md`

**Interfaces:**
- Consumes: `applySkillQuery(records: SkillRecord[], query: DashboardQuery): SkillRecord[]`
- Produces: `SkillTable({ skills, selectedId, onSelect })`, where `skills: SkillRecord[]`

- [x] **Step 1: 50개 초과 결과가 모두 보이는 실패 테스트 작성**

`src/components/dashboard/SkillDashboard.test.tsx`에 다음 테스트를 추가한다.

```tsx
it("renders every filtered skill in one ledger without pagination", async () => {
  const manySkills = inventory();
  const template = manySkills.skills[0]!;
  manySkills.skills = Array.from({ length: 61 }, (_, index) => ({
    ...template,
    id: `skill-${index}`,
    name: `skill-${String(index).padStart(2, "0")}`,
    path: `/Users/me/.codex/skills/skill-${index}/SKILL.md`,
    inode: index + 1,
  }));
  manySkills.stats.matchedFiles = 61;
  manySkills.stats.skillDefinitions = 61;
  manySkills.stats.uniqueNames = 61;
  manySkills.roots[0]!.skillCount = 61;

  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(manySkills)));
  render(() => <SkillDashboard />);

  expect(await screen.findByRole("button", { name: "skill-00 상세 보기" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "skill-60 상세 보기" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /skill-\d+ 상세 보기/ })).toHaveLength(61);
  expect(screen.queryByRole("navigation", { name: "Skill 목록 페이지" })).not.toBeInTheDocument();
});
```

- [x] **Step 2: 실패 테스트 확인**

Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx
```

Expected: `skill-60 상세 보기`를 찾지 못해 FAIL. 기존 50개 page slice가 원인임을 확인한다.

- [x] **Step 3: Dashboard에서 pagination 상태 제거**

`src/components/dashboard/SkillDashboard.tsx`에서 `paginate` import, `page` signal, `pageResult` memo, query/reset 시 `setPage`, `SkillTable`의 `page`/`onPage` props를 제거한다. 전체 결과를 다음처럼 전달한다.

```tsx
<SkillTable
  skills={filteredSkills()}
  selectedId={selected()?.id}
  onSelect={(skill, trigger) => {
    detailTrigger = trigger;
    setSelected(skill);
  }}
/>
```

- [x] **Step 4: SkillTable을 전체 배열 인터페이스로 단순화**

`src/components/dashboard/SkillTable.tsx`의 props와 반복 대상을 다음처럼 바꾼다.

```tsx
interface Props {
  skills: SkillRecord[];
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void;
}

<Show
  when={props.skills.length > 0}
  fallback={
    <div class="empty-state">
      <span aria-hidden="true">∅</span>
      <strong>조건에 맞는 skill이 없습니다.</strong>
      <p>검색어를 줄이거나 필터를 초기화하세요.</p>
    </div>
  }
>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th id="skill-column-name" scope="col">이름</th>
          <th id="skill-column-description" scope="col">설명</th>
          <th id="skill-column-source" scope="col">설정 / 성격</th>
          <th id="skill-column-modified" scope="col">수정</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.skills}>
          {(skill, index) => (
            <tr
              classList={{ "is-selected": props.selectedId === skill.id }}
              style={`--row-index:${Math.min(index(), 12)}`}
            >
              <td class="skill-identity" headers="skill-column-name">
                <button
                  type="button"
                  class="skill-name"
                  aria-label={`${skill.name} 상세 보기`}
                  onClick={(event) => props.onSelect(skill, event.currentTarget)}
                >
                  <span class="record-mark" data-document={skill.recordType === "document"}>
                    {skill.recordType === "skill" ? "S" : "D"}
                  </span>
                  <span>{skill.name}</span>
                </button>
                <code title={skill.path}>{skill.path}</code>
              </td>
              <td class="skill-description" headers="skill-column-description">
                {skill.description || <span class="muted-value">설명 없음</span>}
              </td>
              <td class="skill-source" headers="skill-column-source">
                <strong>{skill.agent}</strong>
                <span>{kindLabel(skill.kind)}</span>
                <code class="skill-config-root" title={skill.configRoot}>{skill.configRoot}</code>
              </td>
              <td class="skill-date" headers="skill-column-modified">
                <time datetime={skill.modifiedAt}>{dateFormatter.format(new Date(skill.modifiedAt))}</time>
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </div>
</Show>
```

`<nav class="pagination" aria-label="Skill 목록 페이지">` 전체를 삭제한다. row index animation 상한과 기존 cell/header markup은 유지한다.

- [x] **Step 5: 폐기된 pagination 코드와 스타일 제거**

`src/lib/dashboard/filter.ts`에서 `PageResult<T>`와 `paginate`를 삭제한다. `src/lib/dashboard/filter.test.ts`에서 `paginate` import와 `describe("paginate", ...)`를 삭제한다. `src/components/dashboard/dashboard.css`에서 `.pagination` 규칙과 모바일 `.pagination` 규칙을 삭제한다.

- [x] **Step 6: 회귀 테스트 통과 확인**

Run:

```bash
npm test -- src/components/dashboard/SkillDashboard.test.tsx src/lib/dashboard/filter.test.ts
```

Expected: 두 test file의 모든 테스트 PASS. 61개 상세 버튼과 pagination navigation 부재 assertion이 통과한다.

- [x] **Step 7: 현재 동작 문서 갱신**

`README.md`의 `50개 단위 페이지네이션`을 `검색·필터 결과 전체를 한 원장에 표시`로 바꾼다. 기존 설계 문서의 pagination 요구를 전체 원장 렌더링으로 바꾸고, 기존 구현 계획 상단에는 다음 안내를 추가한다.

```markdown
> **Superseded:** 페이지네이션 관련 단계와 acceptance는 `2026-07-18-unpaginated-skill-ledger.md` 및 해당 설계 문서로 대체되었습니다.
```

- [x] **Step 8: 전체 검증**

Run:

```bash
npm run verify
git diff --check
```

Expected: 모든 Vitest 테스트 PASS, Astro diagnostics 0개, production build 성공, whitespace 오류 없음.

- [x] **Step 9: 브라우저 smoke 확인**

실행 중인 dev server `http://127.0.0.1:4321/`에서 실제 인벤토리 검색 완료 후 다음을 확인한다.

- `Skill 목록 페이지` navigation이 없음.
- 필터 summary count와 렌더링된 skill row 수가 같음.
- `skill-60`에 해당하는 마지막 fixture가 아닌 실제 마지막 record까지 DOM에서 접근 가능함.
- 검색 후 결과 전체가 하나의 표에 남음.

- [x] **Step 10: 커밋**

```bash
git add README.md docs/superpowers src/components/dashboard src/lib/dashboard
git commit -m "feat(ui): 전체 Skill을 한 원장에 표시"
```
