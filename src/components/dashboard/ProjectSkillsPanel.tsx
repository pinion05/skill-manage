import { For, Show, createSignal } from "solid-js";
import type { ProjectSkillProjection, ProjectSkillGroup } from "../../lib/dashboard/skill-views";
import type { SkillRecord } from "../../lib/inventory/types";
import { useSkillGrid, type RowData } from "./gridColumns";
import { resolveAgentLogo } from "./agent-logos";

interface Props {
  projection: ProjectSkillProjection;
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}

const pathLeaf = (value: string) => value.replace(/\/+$/, "").split("/").at(-1) || value;

/** Inner grid that mounts fresh each time the selected project changes. */
function ProjectSkillGrid(props: {
  group: ProjectSkillGroup;
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}) {
  let host: HTMLDivElement | undefined;

  const rows = (): RowData[] =>
    props.group.skills.map((entry) => ({
      skill: entry.skill,
      group: { label: pathLeaf(props.group.directory), ariaSuffix: ` · ${pathLeaf(props.group.directory)}` },
    }));

  useSkillGrid(() => host, {
    skills: rows,
    selectedId: () => props.selectedId,
    onSelect: props.onSelect,
    groupHeaderName: "프로젝트",
  });

  return <div class="ag-theme-quartz skill-grid" ref={host} />;
}

export function ProjectSkillsPanel(props: Props) {
  const [activeGroup, setActiveGroup] = createSignal<ProjectSkillGroup | null>(null);

  return (
    <section class="taxonomy-panel project-skills" aria-labelledby="project-skills-title">
      <header class="taxonomy-heading">
        <div>
          <p class="section-kicker">PROJECT DIRECTORY INDEX</p>
          <h2 id="project-skills-title">프로젝트 Skill</h2>
          <p>
            {props.projection.groups.length.toLocaleString("ko-KR")}개 dir ·{" "}
            {props.projection.skillCount.toLocaleString("ko-KR")}개 Skill
          </p>
        </div>
      </header>

      <Show
        when={activeGroup()}
        keyed
        fallback={
          <Show
            when={props.projection.groups.length > 0}
            fallback={<div class="taxonomy-empty">프로젝트 Skill이 없습니다.</div>}
          >
            <div class="project-card-grid">
              <For each={props.projection.groups}>
                {(group) => {
                  const leaf = pathLeaf(group.directory);
                  return (
                    <button
                      type="button"
                      class="project-card"
                      aria-label={`${leaf} ${group.skills.length} skill`}
                      onClick={() => setActiveGroup(group)}
                    >
                      <div class="project-card-icon" aria-hidden="true">
                        <span>{leaf.charAt(0).toUpperCase()}</span>
                      </div>
                      <div class="project-card-body">
                        <strong>{leaf}</strong>
                        <span>{group.skills.length.toLocaleString("ko-KR")} skill</span>
                        <code>{group.directory}</code>
                      </div>
                      <Show when={group.ownerCount > 1}>
                        <span class="project-card-badge">{group.ownerCount} agents</span>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        }
      >
        {(group) => (
          <div class="agent-detail-view">
            <button
              type="button"
              class="agent-back-btn"
              onClick={() => setActiveGroup(null)}
            >
              ← 전체 프로젝트
            </button>
            <div class="agent-detail-header">
              <div class="project-detail-icon">
                <span>{pathLeaf(group.directory).charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h3>{pathLeaf(group.directory)}</h3>
                <span>
                  {group.skills.length.toLocaleString("ko-KR")} skill
                  <Show when={group.ownerCount > 1}> · {group.ownerCount} agents</Show>
                </span>
                <code>{group.directory}</code>
              </div>
            </div>
            <ProjectSkillGrid
              group={group}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
            />
          </div>
        )}
      </Show>
    </section>
  );
}
