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
          <p>
            프로젝트 경로를 제외한 SKILL.md {props.projection.skillCount.toLocaleString("ko-KR")}개
          </p>
        </div>
      </header>

      <Show
        when={props.projection.groups.length > 0}
        fallback={<div class="taxonomy-empty">프로젝트를 제외한 Skill이 없습니다.</div>}
      >
        <div class="taxonomy-group-list">
          <For each={props.projection.groups}>
            {(group) => (
              <details
                class="agent-skill-group"
                classList={{ "is-shared-owner": group.owner.type === "shared" }}
              >
                <summary role="button" aria-label={`${group.owner.name} Skill 목록 토글`}>
                  <h3 aria-label={group.owner.name}>
                    <span>{group.owner.name}</span>
                    <small>{group.skills.length.toLocaleString("ko-KR")} SKILLS</small>
                  </h3>
                </summary>
                <ul class="taxonomy-skill-list">
                  <For each={group.skills}>
                    {(entry) => (
                      <li>
                        <button
                          type="button"
                          aria-label={`${entry.skill.name} · ${group.owner.name} · ${entry.aliases[0]?.path ?? entry.skill.path} 상세 보기`}
                          onClick={(event) => props.onSelect(entry.skill, event.currentTarget)}
                        >
                          <strong>{entry.skill.name}</strong>
                          <span>{entry.skill.description || "설명 없음"}</span>
                        </button>
                        <ul class="taxonomy-alias-list">
                          <For each={entry.aliases}>
                            {(alias) => (
                              <li>
                                <code>{alias.path}</code>
                              </li>
                            )}
                          </For>
                        </ul>
                      </li>
                    )}
                  </For>
                </ul>
              </details>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
