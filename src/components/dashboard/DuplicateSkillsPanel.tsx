import { For, Show } from "solid-js";
import type { DuplicateSkillGroup } from "../../lib/dashboard/duplicate-skills";
import type { SkillRecord } from "../../lib/inventory/types";
import { kindLabel } from "./FilterBar";

interface Props {
  groups: DuplicateSkillGroup[];
  onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void;
}

export function DuplicateSkillsPanel(props: Props) {
  const installCount = () => props.groups.reduce((total, group) => total + group.installs.length, 0);

  return (
    <section class="duplicate-skills" aria-labelledby="duplicate-skills-title">
      <header class="duplicate-skills-heading">
        <div>
          <p class="section-kicker">DUPLICATE INSTALLS</p>
          <h2 id="duplicate-skills-title">중복 설치 Skill</h2>
          <p>
            {props.groups.length.toLocaleString("ko-KR")}개 이름 ·{" "}
            {installCount().toLocaleString("ko-KR")}개 설치
          </p>
        </div>
      </header>

      <Show
        when={props.groups.length > 0}
        fallback={
          <div class="duplicate-empty">
            <span aria-hidden="true">✓</span>
            <strong>중복 설치된 skill이 없습니다.</strong>
            <p>같은 이름의 SKILL.md가 두 위치 이상 발견되면 여기에 표시됩니다.</p>
          </div>
        }
      >
        <div class="duplicate-group-list">
          <For each={props.groups}>
            {(group) => (
              <article class="duplicate-group">
                <header>
                  <h3>{group.name}</h3>
                  <span>{group.installs.length.toLocaleString("ko-KR")}곳 설치</span>
                </header>
                <ul>
                  <For each={group.installs}>
                    {(skill) => (
                      <li>
                        <button
                          type="button"
                          aria-label={`${skill.name} · ${skill.agent} · ${skill.path} 상세 보기`}
                          onClick={(event) => props.onSelect(skill, event.currentTarget)}
                        >
                          <span class="duplicate-install-meta">
                            <strong>{skill.agent}</strong>
                            <span>{kindLabel(skill.kind)}</span>
                          </span>
                          <span class="duplicate-path-field">
                            <small>설정 루트</small>
                            <code class="duplicate-config-root">{skill.configRoot}</code>
                          </span>
                          <span class="duplicate-path-field">
                            <small>SKILL PATH</small>
                            <code>{skill.path}</code>
                          </span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
