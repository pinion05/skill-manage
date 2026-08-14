import { For, Show, createSignal } from "solid-js";
import type { AgentSkillProjection, AgentSkillGroup } from "../../lib/dashboard/skill-views";
import type { SkillRecord } from "../../lib/inventory/types";
import { useSkillGrid, type RowData } from "./gridColumns";
import { resolveAgentLogo } from "./agent-logos";

interface Props {
  projection: AgentSkillProjection;
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}

/** Inner grid that mounts fresh each time the selected agent changes. */
function AgentSkillGrid(props: {
  group: AgentSkillGroup;
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}) {
  let host: HTMLDivElement | undefined;

  const rows = (): RowData[] =>
    props.group.skills.map((entry) => ({
      skill: entry.skill,
      group: { label: props.group.owner.name, ariaSuffix: ` · ${props.group.owner.name}` },
    }));

  useSkillGrid(() => host, {
    skills: rows,
    selectedId: () => props.selectedId,
    onSelect: props.onSelect,
    groupHeaderName: "에이전트",
  });

  return <div class="ag-theme-quartz skill-grid" ref={host} />;
}

export function AgentSkillsPanel(props: Props) {
  const [activeGroup, setActiveGroup] = createSignal<AgentSkillGroup | null>(null);

  return (
    <section class="taxonomy-panel agent-skills" aria-labelledby="agent-skills-title">
      <header class="taxonomy-heading">
        <div>
          <p class="section-kicker">NON-PROJECT SKILLS</p>
          <h2 id="agent-skills-title">에이전트 Skill</h2>
          <p>
            프로젝트 경로를 제외한 SKILL.md {props.projection.skillCount.toLocaleString("ko-KR")}개
          </p>
        </div>
      </header>

      <Show
        when={activeGroup()}
        keyed
        fallback={
          <Show
            when={props.projection.groups.length > 0}
            fallback={<div class="taxonomy-empty">프로젝트를 제외한 Skill이 없습니다.</div>}
          >
            <div class="agent-card-grid">
              <For each={props.projection.groups}>
                {(group) => {
                  const logo = resolveAgentLogo(group.owner.id, group.owner.name);
                  const isShared = group.owner.id === "shared";
                  return (
                    <button
                      type="button"
                      class="agent-card"
                      classList={{ "agent-card-shared": isShared }}
                      onClick={() => setActiveGroup(group)}
                    >
                      <Show
                        when={logo}
                        fallback={
                          <div class="agent-card-logo-fallback">
                            {group.owner.name.charAt(0).toUpperCase()}
                          </div>
                        }
                      >
                        <img src={logo!} alt="" class="agent-card-logo" loading="lazy" />
                      </Show>
                      <div class="agent-card-body">
                        <strong>{group.owner.name}</strong>
                        <span>{group.skills.length.toLocaleString("ko-KR")} skill</span>
                      </div>
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
              ← 전체 에이전트
            </button>
            <div class="agent-detail-header">
              <Show
                when={resolveAgentLogo(group.owner.id, group.owner.name)}
                fallback={
                  <div class="agent-detail-logo-fallback">
                    {group.owner.name.charAt(0).toUpperCase()}
                  </div>
                }
              >
                <img
                  src={resolveAgentLogo(group.owner.id, group.owner.name)!}
                  alt=""
                  class="agent-detail-logo"
                />
              </Show>
              <div>
                <h3>{group.owner.name}</h3>
                <span>{group.skills.length.toLocaleString("ko-KR")} skill</span>
              </div>
            </div>
            <AgentSkillGrid
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
