import { Show } from "solid-js";
import type { ProjectSkillProjection } from "../../lib/dashboard/skill-views";
import type { SkillRecord } from "../../lib/inventory/types";
import { useSkillGrid, type RowData } from "./gridColumns";

interface Props {
  projection: ProjectSkillProjection;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}

const pathLeaf = (value: string) => value.replace(/\/+$/, "").split("/").at(-1) || value;

export function ProjectSkillsPanel(props: Props) {
  let host: HTMLDivElement | undefined;

  const rows = (): RowData[] => {
    const out: RowData[] = [];
    for (const group of props.projection.groups) {
      const leaf = pathLeaf(group.directory);
      for (const entry of group.skills) {
        out.push({
          skill: entry.skill,
          group: { label: leaf, ariaSuffix: ` · ${leaf}` },
        });
      }
    }
    return out;
  };

  useSkillGrid(() => host, {
    skills: rows,
    onSelect: props.onSelect,
    groupHeaderName: "프로젝트",
  });

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
        <div class="ag-theme-quartz skill-grid" ref={host}></div>
      </Show>
    </section>
  );
}
