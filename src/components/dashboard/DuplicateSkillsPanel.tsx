import { Show } from "solid-js";
import type { DuplicateSkillGroup } from "../../lib/dashboard/duplicate-skills";
import type { SkillRecord } from "../../lib/inventory/types";
import { useSkillGrid, type RowData } from "./gridColumns";

interface Props {
  groups: DuplicateSkillGroup[];
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}

export function DuplicateSkillsPanel(props: Props) {
  let host: HTMLDivElement | undefined;

  const installCount = () => props.groups.reduce((total, group) => total + group.installs.length, 0);

  const rows = (): RowData[] => {
    const out: RowData[] = [];
    for (const group of props.groups) {
      group.installs.forEach((skill, index) => {
        out.push({
          skill,
          group:
            index === 0
              ? {
                  label: `${group.name} (${group.installs.length})`,
                  ariaSuffix: ` · ${group.name} · 중복`,
                }
              : undefined,
        });
      });
    }
    return out;
  };

  useSkillGrid(() => host, {
    skills: rows,
    onSelect: props.onSelect,
    groupHeaderName: "중복 이름",
  });

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
        <div class="ag-theme-quartz skill-grid" ref={host}></div>
      </Show>
    </section>
  );
}
