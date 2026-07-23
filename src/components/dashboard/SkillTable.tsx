import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { createGrid, type ICellRendererParams, type ColDef, type GridApi } from "ag-grid-community";
import { Show, createEffect, onCleanup, onMount } from "solid-js";
import type { SkillRecord } from "../../lib/inventory/types";
import { kindLabel } from "./FilterBar";

const EMPTY_MESSAGE = "조건에 맞는 skill이 없습니다.";

interface Props {
  skills: SkillRecord[];
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

export function SkillTable(props: Props) {
  let host: HTMLDivElement | undefined;
  let api: GridApi<SkillRecord> | undefined;

  const columnDefs: ColDef<SkillRecord>[] = [
    {
      headerName: "이름",
      field: "name",
      width: 230,
      cellRenderer: (params: ICellRendererParams<SkillRecord>) => {
        const skill = params.data;
        if (!skill) return "";
        const wrap = document.createElement("div");
        wrap.className = "skill-identity";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "skill-name";
        button.setAttribute("aria-label", `${skill.name} 상세 보기`);
        button.addEventListener("click", () => props.onSelect(skill, button));
        const mark = document.createElement("span");
        mark.className = "record-mark";
        mark.dataset.document = String(skill.recordType === "document");
        mark.textContent = skill.recordType === "skill" ? "S" : "D";
        const name = document.createElement("span");
        name.textContent = skill.name;
        button.append(mark, name);
        const path = document.createElement("code");
        path.title = skill.path;
        path.textContent = skill.path;
        wrap.append(button, path);
        return wrap;
      },
    },
    {
      headerName: "설명",
      field: "description",
      flex: 1,
      cellRenderer: (params: ICellRendererParams<SkillRecord>) => {
        const skill = params.data;
        const cell = document.createElement("div");
        cell.className = "skill-description";
        if (skill && skill.description) {
          cell.textContent = skill.description;
        } else {
          const muted = document.createElement("span");
          muted.className = "muted-value";
          muted.textContent = "설명 없음";
          cell.append(muted);
        }
        return cell;
      },
    },
    {
      headerName: "설정 / 성격",
      field: "configRoot",
      width: 250,
      cellRenderer: (params: ICellRendererParams<SkillRecord>) => {
        const skill = params.data;
        if (!skill) return "";
        const grid = document.createElement("div");
        grid.className = "skill-source";
        const agent = document.createElement("strong");
        agent.textContent = skill.agent;
        const kind = document.createElement("span");
        kind.textContent = kindLabel(skill.kind);
        const root = document.createElement("code");
        root.className = "skill-config-root";
        root.title = skill.configRoot;
        root.textContent = skill.configRoot;
        grid.append(agent, kind, root);
        return grid;
      },
    },
    {
      headerName: "수정",
      field: "modifiedAt",
      width: 110,
      cellRenderer: (params: ICellRendererParams<SkillRecord>) => {
        const skill = params.data;
        if (!skill) return "";
        const time = document.createElement("time");
        time.dateTime = skill.modifiedAt;
        time.textContent = dateFormatter.format(new Date(skill.modifiedAt));
        return time;
      },
    },
  ];

  onMount(() => {
    if (!host) return;
    api = createGrid<SkillRecord>(host, {
      columnDefs,
      rowData: props.skills,
      domLayout: "autoHeight",
      getRowId: (params) => params.data.id,
      defaultColDef: { resizable: true, sortable: true },
      suppressCellFocus: true,
      suppressScrollOnNewData: true,
    });
  });

  createEffect(() => {
    const skills = props.skills;
    api?.setGridOption("rowData", skills);
  });

  // Reflect selection by toggling the is-selected class directly on row DOM
  // nodes. Avoiding redrawRows/refreshCells here is important: those rebuild the
  // row's cell DOM and would destroy the button that holds focus, breaking
  // focus restoration when the detail panel closes.
  createEffect(() => {
    const selectedId = props.selectedId;
    host?.querySelectorAll(".ag-row").forEach((row) => {
      row.classList.toggle("is-selected", row.getAttribute("row-id") === selectedId);
    });
  });

  onCleanup(() => api?.destroy());

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
