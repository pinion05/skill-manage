import { createMemo, createResource, createSignal, Show } from "solid-js";
import { applySkillQuery, paginate, type DashboardQuery } from "../../lib/dashboard/filter";
import type {
  InventorySnapshot,
  SkillKind,
  SkillRecord,
  SkillRecordType,
} from "../../lib/inventory/types";
import { FilterBar } from "./FilterBar";
import { LinkHealthPanel } from "./LinkHealthPanel";
import { SkillDetail } from "./SkillDetail";
import { SkillTable } from "./SkillTable";
import { StatsStrip } from "./StatsStrip";
import "./dashboard.css";

const INITIAL_QUERY: DashboardQuery = {
  search: "",
  kinds: [],
  roots: [],
  recordTypes: [],
  sort: "name",
  direction: "asc",
};

async function requestInventory(url: string, init?: RequestInit): Promise<InventorySnapshot> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "인벤토리를 불러오지 못했습니다.");
  return body as InventorySnapshot;
}

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function SkillDashboard() {
  const [snapshot, { mutate }] = createResource(() => requestInventory("/api/inventory"));
  const [query, setQuery] = createSignal<DashboardQuery>(INITIAL_QUERY);
  const [page, setPage] = createSignal(1);
  const [view, setView] = createSignal<"skills" | "links">("skills");
  const [selected, setSelected] = createSignal<SkillRecord>();
  const [refreshing, setRefreshing] = createSignal(false);
  const [actionError, setActionError] = createSignal("");

  const filteredSkills = createMemo(() => {
    const current = snapshot();
    return current ? applySkillQuery(current.skills, query()) : [];
  });
  const pageResult = createMemo(() => paginate(filteredSkills(), page(), 50));
  const selectedDuplicates = createMemo(() => {
    const current = selected();
    if (!current || !snapshot()) return [];
    const name = current.name.toLocaleLowerCase();
    return snapshot()!.skills.filter(
      (skill) => skill.id !== current.id && skill.name.toLocaleLowerCase() === name,
    );
  });
  const rootsWithSkills = createMemo(() =>
    (snapshot()?.roots ?? []).filter((root) => root.skillCount + root.documentCount > 0),
  );

  const updateQuery = (patch: Partial<DashboardQuery>) => {
    setQuery((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const refresh = async () => {
    setRefreshing(true);
    setActionError("");
    try {
      const next = await requestInventory("/api/inventory/refresh", { method: "POST" });
      mutate(next);
      const currentSelection = selected();
      if (currentSelection) setSelected(next.skills.find((skill) => skill.id === currentSelection.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "재검색에 실패했습니다.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main class="app-shell">
      <div class="scan-rail" classList={{ active: refreshing() }} aria-hidden="true"><i /></div>
      <header class="app-header">
        <div class="brand-block">
          <span class="brand-index">LOCAL / 001</span>
          <h1><span>SKILL</span><span>ATLAS</span></h1>
          <p>코딩 에이전트의 skill 파일과 링크를 한곳에서 읽습니다.</p>
        </div>

        <div class="scan-control">
          <Show when={snapshot()}>
            {(current) => (
              <p>
                <span>LAST SCAN</span>
                <strong>{timeFormatter.format(new Date(current().generatedAt))}</strong>
                <small>{current().durationMs.toLocaleString("ko-KR")} ms</small>
              </p>
            )}
          </Show>
          <button type="button" onClick={refresh} disabled={refreshing() || snapshot.loading}>
            <span aria-hidden="true">↻</span>
            {refreshing() ? "재검색 중" : "파일시스템 재검색"}
          </button>
        </div>
      </header>

      <Show
        when={snapshot()}
        fallback={
          <section class="initial-loading" aria-live="polite">
            <span class="loading-rule" aria-hidden="true" />
            <p>파일시스템을 읽는 중</p>
            <small>SKILL.md와 심볼릭 링크를 조사합니다.</small>
            <Show when={snapshot.error}><strong>{snapshot.error?.message}</strong></Show>
          </section>
        }
      >
        {(current) => (
          <>
            <StatsStrip stats={current().stats} />

            <Show when={actionError() || current().errors.count > 0}>
              <div class="warning-line" role="status">
                <strong>{actionError() || `접근하지 못한 경로 ${current().errors.count.toLocaleString("ko-KR")}개`}</strong>
                <span>{actionError() ? "이전 인벤토리를 유지합니다." : "나머지 경로의 검색 결과는 정상적으로 표시됩니다."}</span>
              </div>
            </Show>

            <nav class="view-tabs" aria-label="인벤토리 보기" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view() === "skills"}
                classList={{ active: view() === "skills" }}
                onClick={() => setView("skills")}
              >
                Skill 파일 <span>{current().stats.matchedFiles.toLocaleString("ko-KR")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view() === "links"}
                classList={{ active: view() === "links" }}
                onClick={() => setView("links")}
              >
                링크 상태 <span>{current().links.length.toLocaleString("ko-KR")}</span>
              </button>
            </nav>

            <Show
              when={view() === "skills"}
              fallback={<LinkHealthPanel links={current().links} />}
            >
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
                onReset={() => {
                  setQuery(INITIAL_QUERY);
                  setPage(1);
                }}
              />
              <SkillTable
                page={pageResult()}
                selectedId={selected()?.id}
                onSelect={setSelected}
                onPage={setPage}
              />
            </Show>

            <footer class="inventory-footer">
              <span>READ ONLY</span>
              <p>{current().searchRoots.join(" · ")}</p>
            </footer>
          </>
        )}
      </Show>

      <Show when={selected()} keyed>
        {(skill) => (
          <SkillDetail skill={skill} duplicates={selectedDuplicates()} onClose={() => setSelected()} />
        )}
      </Show>
    </main>
  );
}
