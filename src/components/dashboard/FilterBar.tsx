import { For } from "solid-js";
import type { DashboardQuery } from "../../lib/dashboard/filter";
import type { InventoryRoot, SkillKind, SkillRecordType } from "../../lib/inventory/types";

interface Props {
  query: DashboardQuery;
  roots: InventoryRoot[];
  resultCount: number;
  onSearch: (value: string) => void;
  onKind: (value: SkillKind | "") => void;
  onRoot: (value: string) => void;
  onRecordType: (value: SkillRecordType | "") => void;
  onSort: (sort: DashboardQuery["sort"], direction: DashboardQuery["direction"]) => void;
  onReset: () => void;
}

const KIND_OPTIONS: Array<{ value: SkillKind; label: string }> = [
  { value: "user/global-config", label: "사용자 설정" },
  { value: "app-bundled", label: "앱 내장" },
  { value: "app-runtime", label: "앱 런타임" },
  { value: "plugin/cache/vendor", label: "플러그인·캐시" },
  { value: "installed-package/source-dependency", label: "설치 패키지" },
  { value: "project/source-local", label: "프로젝트 로컬" },
  { value: "backup/temp/fixture", label: "백업·임시" },
  { value: "other", label: "기타" },
];

export function kindLabel(kind: SkillKind): string {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

export function FilterBar(props: Props) {
  const selectedKind = () => props.query.kinds[0] ?? "";
  const selectedRoot = () => props.query.roots[0] ?? "";
  const selectedRecordType = () => props.query.recordTypes[0] ?? "";
  const selectedSort = () => `${props.query.sort}:${props.query.direction}`;
  const hasFilters = () =>
    Boolean(
      props.query.search ||
        props.query.kinds.length ||
        props.query.roots.length ||
        props.query.recordTypes.length,
    );

  return (
    <section class="filter-workbench" aria-label="Skill 검색과 필터">
      <label class="search-field">
        <span class="field-label">검색</span>
        <span class="search-control">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={props.query.search}
            onInput={(event) => props.onSearch(event.currentTarget.value)}
            placeholder="이름, 설명, 에이전트, 절대경로"
            autocomplete="off"
          />
        </span>
      </label>

      <label>
        <span class="field-label">파일 유형</span>
        <select
          value={selectedRecordType()}
          onChange={(event) => props.onRecordType(event.currentTarget.value as SkillRecordType | "")}
        >
          <option value="">전체 파일</option>
          <option value="skill">SKILL.md</option>
          <option value="document">skills.md 문서</option>
        </select>
      </label>

      <label>
        <span class="field-label">성격</span>
        <select
          value={selectedKind()}
          onChange={(event) => props.onKind(event.currentTarget.value as SkillKind | "")}
        >
          <option value="">전체 성격</option>
          <For each={KIND_OPTIONS}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </label>

      <label class="root-filter">
        <span class="field-label">에이전트 설정</span>
        <select value={selectedRoot()} onChange={(event) => props.onRoot(event.currentTarget.value)}>
          <option value="">전체 설정 루트</option>
          <For each={props.roots}>
            {(root) => (
              <option value={root.configRoot}>
                {root.agent} · {root.skillCount + root.documentCount}
              </option>
            )}
          </For>
        </select>
      </label>

      <label>
        <span class="field-label">정렬</span>
        <select
          value={selectedSort()}
          onChange={(event) => {
            const [sort, direction] = event.currentTarget.value.split(":") as [
              DashboardQuery["sort"],
              DashboardQuery["direction"],
            ];
            props.onSort(sort, direction);
          }}
        >
          <option value="name:asc">이름 A–Z</option>
          <option value="name:desc">이름 Z–A</option>
          <option value="modified:desc">최근 수정순</option>
          <option value="path:asc">경로순</option>
        </select>
      </label>

      <div class="filter-summary" aria-live="polite">
        <strong>{props.resultCount.toLocaleString("ko-KR")}</strong>
        <span>개 결과</span>
        <button type="button" onClick={props.onReset} disabled={!hasFilters()}>
          필터 초기화
        </button>
      </div>
    </section>
  );
}
