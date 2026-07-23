import { Show } from "solid-js";
import type { AgentSkillProjection } from "../../lib/dashboard/skill-views";
import type { SkillRecord } from "../../lib/inventory/types";
import { useSkillGrid, type RowData } from "./gridColumns";

interface Props {
  projection: AgentSkillProjection;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}

export function AgentSkillsPanel(props: Props) {
  let host: HTMLDivElement | undefined;

  const rows = (): RowData[] => {
    const out: RowData[] = [];
    for (const group of props.projection.groups) {
      group.skills.forEach((entry, index) => {
        out.push({
          skill: entry.skill,
          group:
            index === 0
              ? { label: group.owner.name, ariaSuffix: ` · ${group.owner.name}` }
              : undefined,
        });
      });
    }
    return out;
  };

  useSkillGrid(() => host, {
    skills: rows,
    onSelect: props.onSelect,
    groupHeaderName: "에이전트",
  });

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
        <div class="ag-theme-quartz skill-grid" ref={host}></div>
      </Show>
    </section>
  );
}
