import { createMemo, createResource, createSignal, Match, Show, Switch } from "solid-js";
import { groupDuplicateSkills, normalizeSkillName } from "../../lib/dashboard/duplicate-skills";
import { applySkillQuery, type DashboardQuery } from "../../lib/dashboard/filter";
import type {
  InventorySnapshot,
  ScanMode,
  SkillKind,
  SkillRecord,
  SkillRecordType,
} from "../../lib/inventory/types";
import { DuplicateSkillsPanel } from "./DuplicateSkillsPanel";
import { FilterBar } from "./FilterBar";
import { LinkHealthPanel } from "./LinkHealthPanel";
import { OfficialSourcesPanel } from "./OfficialSourcesPanel";
import { ScanWarnings } from "./ScanWarnings";
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
  const [scanMode, setScanMode] = createSignal<ScanMode>("official");
  const [snapshot, { mutate }] = createResource(scanMode, (mode) =>
    requestInventory(`/api/inventory?mode=${mode}`),
  );
  const [query, setQuery] = createSignal<DashboardQuery>(INITIAL_QUERY);
  const [view, setView] = createSignal<"skills" | "duplicates" | "links" | "sources">("skills");
  const [selected, setSelected] = createSignal<SkillRecord>();
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshStatus, setRefreshStatus] = createSignal("");
  const [actionError, setActionError] = createSignal("");
  let detailTrigger: HTMLElement | undefined;

  const filteredSkills = createMemo(() => {
    const current = snapshot();
    return current ? applySkillQuery(current.skills, query()) : [];
  });
  const duplicateGroups = createMemo(() => groupDuplicateSkills(snapshot()?.skills ?? []));
  const selectedDuplicates = createMemo(() => {
    const current = selected();
    if (!current || !snapshot()) return [];
    const name = normalizeSkillName(current.name);
    return snapshot()!.skills.filter(
      (skill) => skill.id !== current.id && normalizeSkillName(skill.name) === name,
    );
  });
  const rootsWithSkills = createMemo(() =>
    (snapshot()?.roots ?? []).filter((root) => root.skillCount + root.documentCount > 0),
  );

  const updateQuery = (patch: Partial<DashboardQuery>) => {
    setQuery((current) => ({ ...current, ...patch }));
  };

  const changeScanMode = (nextMode: ScanMode) => {
    if (nextMode === scanMode()) return;
    setSelected();
    detailTrigger = undefined;
    setQuery(INITIAL_QUERY);
    setActionError("");
    setRefreshStatus(
      nextMode === "official"
        ? "공식 디렉터리 인벤토리를 불러옵니다."
        : "전체 파일시스템 인벤토리를 불러옵니다.",
    );
    mutate(undefined);
    setScanMode(nextMode);
  };

  const refresh = async () => {
    const currentMode = scanMode();
    setRefreshing(true);
    setRefreshStatus("파일시스템 재검색을 시작했습니다.");
    setActionError("");
    try {
      const next = await requestInventory(`/api/inventory/refresh?mode=${currentMode}`, {
        method: "POST",
      });
      mutate(next);
      const currentSelection = selected();
      if (currentSelection) setSelected(next.skills.find((skill) => skill.id === currentSelection.id));
      setRefreshStatus("파일시스템 재검색이 완료되었습니다.");
    } catch (error) {
      setRefreshStatus("파일시스템 재검색에 실패했습니다.");
      setActionError(error instanceof Error ? error.message : "재검색에 실패했습니다.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main class="app-shell">
      <p class="sr-only" aria-live="polite" aria-atomic="true">{refreshStatus()}</p>
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
          <div class="scan-mode-control" role="group" aria-label="검색 범위">
            <button
              type="button"
              aria-pressed={scanMode() === "official"}
              classList={{ active: scanMode() === "official" }}
              disabled={refreshing() || snapshot.loading}
              onClick={() => changeScanMode("official")}
            >
              공식 디렉터리
            </button>
            <button
              type="button"
              aria-pressed={scanMode() === "full"}
              classList={{ active: scanMode() === "full" }}
              disabled={refreshing() || snapshot.loading}
              onClick={() => changeScanMode("full")}
            >
              전체 파일시스템
            </button>
          </div>
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
            <div class="loading-stats" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </div>
            <Show when={snapshot.error}><strong>{snapshot.error?.message}</strong></Show>
          </section>
        }
      >
        {(current) => (
          <>
            <StatsStrip stats={current().stats} />

            <Show when={actionError()}>
              <div class="warning-line" role="alert">
                <strong>{actionError()}</strong>
                <span>이전 인벤토리를 유지합니다.</span>
              </div>
            </Show>
            <Show when={current().errors.count > 0}>
              <ScanWarnings count={current().errors.count} samples={current().errors.samples} />
            </Show>

            <nav class="view-tabs" aria-label="인벤토리 보기">
              <button
                type="button"
                aria-pressed={view() === "skills"}
                classList={{ active: view() === "skills" }}
                onClick={() => setView("skills")}
              >
                Skill 파일 <span>{current().stats.matchedFiles.toLocaleString("ko-KR")}</span>
              </button>
              <button
                type="button"
                aria-pressed={view() === "duplicates"}
                classList={{ active: view() === "duplicates" }}
                onClick={() => setView("duplicates")}
              >
                중복 설치 <span>{duplicateGroups().length.toLocaleString("ko-KR")}</span>
              </button>
              <button
                type="button"
                aria-pressed={view() === "links"}
                classList={{ active: view() === "links" }}
                onClick={() => setView("links")}
              >
                링크 상태 <span>{current().links.length.toLocaleString("ko-KR")}</span>
              </button>
              <button
                type="button"
                aria-pressed={view() === "sources"}
                classList={{ active: view() === "sources" }}
                onClick={() => setView("sources")}
              >
                공식 소스 <span>{current().officialSources.agents.length.toLocaleString("ko-KR")}</span>
              </button>
            </nav>

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
              <Match when={view() === "sources"}>
                <OfficialSourcesPanel summary={current().officialSources} />
              </Match>
            </Switch>

            <footer class="inventory-footer">
              <span>READ ONLY</span>
              <p>{current().searchRoots.join(" · ")}</p>
            </footer>
          </>
        )}
      </Show>

      <Show when={selected()} keyed>
        {(skill) => (
          <SkillDetail
            skill={skill}
            scanMode={snapshot()?.scanMode ?? scanMode()}
            duplicates={selectedDuplicates()}
            returnFocus={detailTrigger}
            onClose={() => setSelected()}
          />
        )}
      </Show>
    </main>
  );
}
