import { Show } from "solid-js";
import type { SkillRecord } from "../../lib/inventory/types";
import { useSkillGrid, type RowData } from "./gridColumns";

const EMPTY_MESSAGE = "조건에 맞는 skill이 없습니다.";

interface Props {
  skills: SkillRecord[];
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}

export function SkillTable(props: Props) {
  let host: HTMLDivElement | undefined;

  const rows = (): RowData[] =>
    props.skills.map((skill) => ({ skill }));

  useSkillGrid(() => host, {
    skills: rows,
    selectedId: () => props.selectedId,
    onSelect: props.onSelect,
  });

  return (
    <section class="ledger" aria-label="Skill 목록">
      <div class="ag-theme-quartz skill-grid" ref={host}></div>
      <Show when={props.skills.length === 0}>
        <div class="empty-state overlay">
          <span aria-hidden="true">∅</span>
          <strong>{EMPTY_MESSAGE}</strong>
          <p>검색어를 줄이거나 필터를 초기화하세요.</p>
        </div>
      </Show>
    </section>
  );
}
