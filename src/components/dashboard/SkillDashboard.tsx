import { createMemo, createResource, createSignal, Match, Show, Switch } from "solid-js";
import { groupDuplicateSkills, normalizeSkillName } from "../../lib/dashboard/duplicate-skills";
import { applySkillQuery, type DashboardQuery } from "../../lib/dashboard/filter";
import {
  createAgentSkillProjection,
  createProjectSkillProjection,
} from "../../lib/dashboard/skill-views";
import type {
  InventorySnapshot,
  ScanMode,
  ScanProgress,
  SkillKind,
  SkillRecord,
} from "../../lib/inventory/types";
import { AgentSkillsPanel } from "./AgentSkillsPanel";
import { DuplicateSkillsPanel } from "./DuplicateSkillsPanel";
import { FilterBar } from "./FilterBar";
import { LinkHealthPanel } from "./LinkHealthPanel";
import { OfficialSourcesPanel } from "./OfficialSourcesPanel";
import { ProjectSkillsPanel } from "./ProjectSkillsPanel";
import { ScanWarnings } from "./ScanWarnings";
import { SkillDetail } from "./SkillDetail";
import { SkillTable } from "./SkillTable";
import { StatsStrip } from "./StatsStrip";
import "./dashboard.css";

const INITIAL_QUERY: DashboardQuery = {
  search: "",
  kinds: [],
  roots: [],
  sort: "name",
  direction: "asc",
};

/**
 * SSE 기반 스캔 — EventSource로 /api/inventory/scan에 연결.
 * progress 이벤트 → onProgress 콜백, done 이벤트 → resolve, error → reject.
 */
function requestInventorySSE(
  mode: ScanMode,
  onProgress?: (p: ScanProgress) => void,
): Promise<InventorySnapshot> {
  return new Promise((resolve, reject) => {
    const source = new EventSource(`/api/inventory/scan?mode=${mode}`);
    source.addEventListener("progress", (e) => {
      if (!onProgress) return;
      try {
        onProgress(JSON.parse(e.data));
      } catch {
        // ignore malformed payload
      }
    });
    source.addEventListener("done", (e) => {
      source.close();
      try {
        resolve(JSON.parse(e.data) as InventorySnapshot);
      } catch {
        reject(new Error("인벤토리 데이터를 파싱하지 못했습니다."));
      }
    });
    source.addEventListener("error", (e) => {
      source.close();
      // SSE 'error' event는 우리가 보낸 에러가 아닐 수도 있다 (네트워크 끊김 등).
      // done 이벤트가 이미 왔다면 resolve된 상태이므로 reject는 무시됨.
      const data = (e as MessageEvent).data;
      if (data) {
        try {
          reject(new Error((JSON.parse(data) as { error: string }).error));
        } catch {
          reject(new Error("스캔 중 오류가 발생했습니다."));
        }
      } else {
        reject(new Error("스캔 연결이 끊어졌습니다."));
      }
    });
  });
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
    requestInventorySSE(mode, (p) => setProgress(p)),
  );
  const [query, setQuery] = createSignal<DashboardQuery>(INITIAL_QUERY);
  const [view, setView] = createSignal<
    "skills" | "agents" | "projects" | "duplicates" | "links" | "sources"
  >("skills");
  const [selected, setSelected] = createSignal<SkillRecord>();
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshStatus, setRefreshStatus] = createSignal("");
  const [actionError, setActionError] = createSignal("");
  const [progress, setProgress] = createSignal<ScanProgress | undefined>();
  let detailTrigger: HTMLElement | undefined;

  const filteredSkills = createMemo(() => {
    const current = snapshot();
    return current ? applySkillQuery(current.skills, query()) : [];
  });
  const agentSkills = createMemo(() => createAgentSkillProjection(snapshot()?.skills ?? []));
  const projectSkills = createMemo(() => createProjectSkillProjection(snapshot()?.skills ?? []));
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
    setProgress();
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
    setProgress();
    setRefreshStatus("파일시스템 재검색을 시작했습니다.");
    setActionError("");
    try {
      const next = await requestInventorySSE(currentMode, (p) => setProgress(p));
      mutate(next);
      const currentSelection = selected();
      if (currentSelection) setSelected(next.skills.find((skill) => skill.id === currentSelection.id));
      setProgress();
      setRefreshStatus("파일시스템 재검색이 완료되었습니다.");
    } catch (error) {
      setRefreshStatus("파일시스템 재검색에 실패했습니다.");
      setActionError(error instanceof Error ? error.message : "재검색에 실패했습니다.");
    } finally {
      setRefreshing(false);
    }
  };

  const deleteSkill = async (skill: SkillRecord) => {
    setActionError("");
    try {
      const response = await fetch(
        `/api/skills/delete?id=${encodeURIComponent(skill.id)}&mode=${scanMode()}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "skill 삭제에 실패했습니다.");
      // Drop the deleted skill from the cached snapshot and close the detail.
      const prev = snapshot();
      if (prev) {
        mutate({ ...prev, skills: prev.skills.filter((s) => s.id !== skill.id) });
      }
      if (selected()?.id === skill.id) setSelected();
      setRefreshStatus(`${skill.name}을(를) 삭제했습니다.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "skill 삭제에 실패했습니다.");
      throw error;
    }
  };

  return (
    <main class="app-shell">
      <p class="sr-only" aria-live="polite" aria-atomic="true">{refreshStatus()}</p>
      <div class="scan-rail" classList={{ active: refreshing() || snapshot.loading }} aria-hidden="true"><i /></div>
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
            <div class="loading-grid" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <span style={{ "--i": String(i) }} />
              ))}
            </div>
            <p>파일시스템을 읽는 중</p>
            <Show
              when={progress()}
              fallback={<small>SKILL.md와 심볼릭 링크를 조사합니다.</small>}
            >
              {(p) => (
                <div class="loading-grid-stats">
                  <span>📁 {p().visitedDirs.toLocaleString("ko-KR")} 디렉터리</span>
                  <span>📄 {p().skillsFound.toLocaleString("ko-KR")} skill</span>
                  <span>🔗 {p().linksFound.toLocaleString("ko-KR")} 링크</span>
                  <span>⏱ {p().elapsedMs.toLocaleString("ko-KR")}ms</span>
                </div>
              )}
            </Show>
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
                aria-pressed={view() === "agents"}
                classList={{ active: view() === "agents" }}
                onClick={() => setView("agents")}
              >
                에이전트 <span>{agentSkills().skillCount.toLocaleString("ko-KR")}</span>
              </button>
              <button
                type="button"
                aria-pressed={view() === "projects"}
                classList={{ active: view() === "projects" }}
                onClick={() => setView("projects")}
              >
                프로젝트 <span>{projectSkills().skillCount.toLocaleString("ko-KR")}</span>
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
                공식 소스{" "}
                <span>
                  {(
                    current().officialSources.agents.length +
                    (current().officialSources.shared.globalPaths.length +
                      current().officialSources.shared.projectPaths.length >
                    0
                      ? 1
                      : 0)
                  ).toLocaleString("ko-KR")}
                </span>
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
              <Match when={view() === "agents"}>
                <AgentSkillsPanel
                  projection={agentSkills()}
                  onSelect={(skill, trigger) => {
                    detailTrigger = trigger;
                    setSelected(skill);
                  }}
                />
              </Match>
              <Match when={view() === "projects"}>
                <ProjectSkillsPanel
                  projection={projectSkills()}
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
            onDelete={deleteSkill}
          />
        )}
      </Show>
    </main>
  );
}
