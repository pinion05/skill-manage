import { For, Show } from "solid-js";
import type { ProjectSkillProjection } from "../../lib/dashboard/skill-views";
import type { SkillRecord } from "../../lib/inventory/types";

interface Props {
  projection: ProjectSkillProjection;
  onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void;
}

const pathLeaf = (value: string) => value.replace(/\/+$/, "").split("/").at(-1) || value;

export function ProjectSkillsPanel(props: Props) {
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
        when={props.projection.groups.length > 0}
        fallback={<div class="taxonomy-empty">프로젝트 Skill이 없습니다.</div>}
      >
        <div class="project-group-list">
          <For each={props.projection.groups}>
            {(group) => (
              <details class="project-skill-group">
                <summary
                  role="button"
                  aria-label={`${pathLeaf(group.directory)} 프로젝트 Skill 목록 토글`}
                >
                  <h3 aria-label={pathLeaf(group.directory)}>
                    <span>{pathLeaf(group.directory)}</span>
                    <code>{group.directory}</code>
                    <small>
                      {group.skills.length.toLocaleString("ko-KR")} SKILLS ·{" "}
                      {group.ownerCount.toLocaleString("ko-KR")} AGENTS
                    </small>
                  </h3>
                </summary>
                <ul class="taxonomy-skill-list">
                  <For each={group.skills}>
                    {(entry) => (
                      <li>
                        <button
                          type="button"
                          aria-label={`${entry.skill.name} · ${group.directory} 상세 보기`}
                          onClick={(event) => props.onSelect(entry.skill, event.currentTarget)}
                        >
                          <strong>{entry.skill.name}</strong>
                          <span>{entry.skill.description || "설명 없음"}</span>
                        </button>
                        <div class="owner-badges">
                          <For each={entry.owners}>{(owner) => <span>{owner.name}</span>}</For>
                        </div>
                        <ul class="taxonomy-alias-list">
                          <For each={entry.aliases}>
                            {(alias) => (
                              <li>
                                <strong>{alias.owner.name} ·</strong>
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
