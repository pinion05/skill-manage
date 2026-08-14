import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { createGrid, type GridApi, type ICellRendererParams, type RowClickedEvent } from "ag-grid-community";
import { createEffect, onCleanup, onMount } from "solid-js";
import type { SkillRecord } from "../../lib/inventory/types";
import { kindLabel } from "./FilterBar";

/** Shared AG Grid helpers used by every taxonomy table (skills/agents/projects/duplicates). */

export const gridDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

/** Optional first column grouping cell: a bold owner/directory/name header + clickable skill button. */
export interface GroupMeta {
  /** Display label for the group (owner name, directory, duplicate name). */
  label: string;
  /** aria-label suffix appended after the skill name for the detail button. */
  ariaSuffix: string;
}

export interface RowData<T extends SkillRecord = SkillRecord> {
  skill: T;
  /** Group metadata for the first row of each group; omitted on subsequent rows. */
  group?: GroupMeta;
}

/** Build the clickable name cell used by every skill table. */
export function renderSkillNameCell(
  params: ICellRendererParams<RowData>,
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void,
): HTMLElement {
  const row = params.data;
  if (!row) return document.createElement("span");
  const { skill } = row;
  const ariaSuffix = row.group?.ariaSuffix ?? "";
  const wrap = document.createElement("div");
  wrap.className = "skill-identity";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "skill-name";
  button.setAttribute("aria-label", `${skill.name}${ariaSuffix} 상세 보기`);
  button.addEventListener("click", () => onSelect(skill, button));
  button.textContent = skill.name;
  wrap.append(button);
  return wrap;
}

export function renderDescriptionCell(params: ICellRendererParams<RowData>): HTMLElement {
  const row = params.data;
  const cell = document.createElement("div");
  cell.className = "skill-description";
  if (row?.skill.description) {
    cell.textContent = row.skill.description;
  } else {
    const muted = document.createElement("span");
    muted.className = "muted-value";
    muted.textContent = "설명 없음";
    cell.append(muted);
  }
  return cell;
}

export function renderSourceCell(params: ICellRendererParams<RowData>): HTMLElement {
  const row = params.data;
  if (!row) return document.createElement("span");
  const { skill } = row;
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
}

export function renderDateCell(params: ICellRendererParams<RowData>): HTMLElement {
  const row = params.data;
  if (!row) return document.createElement("span");
  const time = document.createElement("time");
  time.dateTime = row.skill.modifiedAt;
  time.textContent = gridDateFormatter.format(new Date(row.skill.modifiedAt));
  return time;
}

export function renderTokenCell(field: "contentsTokens" | "descriptionTokens") {
  return (params: ICellRendererParams<RowData>): HTMLElement => {
    const row = params.data;
    if (!row) return document.createElement("span");
    const span = document.createElement("span");
    span.className = "token-count";
    span.textContent = (row.skill[field] ?? 0).toLocaleString("ko-KR");
    return span;
  };
}

export interface GridHostOptions {
  skills: () => RowData[];
  selectedId?: () => string | undefined;
  onSelect: (skill: SkillRecord, trigger: HTMLElement) => void;
  /** Extra column definitions inserted after the shared skill columns. */
  extraColumns?: import("ag-grid-community").ColDef<RowData>[];
  /** Optional first column for the group label (owner/directory/duplicate name). */
  groupHeaderName?: string;
}

/**
 * Mount an AG Grid into a host element with the shared skill columns + token columns.
 * Returns nothing; lifecycle (create/destroy/update) is wired via Solid primitives.
 * Call inside a component body — it registers onMount/onCleanup effects.
 */
export function useSkillGrid(host: () => HTMLDivElement | undefined, options: GridHostOptions): void {
  let api: GridApi<RowData> | undefined;

  const baseColumns: import("ag-grid-community").ColDef<RowData>[] = [
    ...(options.groupHeaderName
      ? [{
          headerName: options.groupHeaderName,
          field: "group" as keyof RowData,
          width: 180,
          cellRenderer: (params: ICellRendererParams<RowData>) => {
            const group = params.data?.group;
            if (!group) return document.createTextNode("");
            const span = document.createElement("span");
            span.className = "group-label";
            span.textContent = group.label;
            return span;
          },
        }]
      : []),
    {
      headerName: "이름",
      field: "skill.name" as const,
      width: 230,
      cellRenderer: (params: ICellRendererParams<RowData>) =>
        renderSkillNameCell(params, options.onSelect),
    },
    { headerName: "설명", field: "skill.description" as const, flex: 1, cellRenderer: renderDescriptionCell },
    {
      headerName: "설정 / 성격",
      field: "skill.configRoot" as const,
      width: 250,
      cellRenderer: renderSourceCell,
    },
    ...(options.extraColumns ?? []),
    {
      headerName: "수정",
      field: "skill.modifiedAt" as const,
      width: 110,
      cellRenderer: renderDateCell,
    },
    {
      headerName: "본문 토큰",
      field: "skill.contentsTokens" as const,
      width: 110,
      type: "numericColumn",
      cellRenderer: renderTokenCell("contentsTokens"),
    },
    {
      headerName: "설명 토큰",
      field: "skill.descriptionTokens" as const,
      width: 110,
      type: "numericColumn",
      cellRenderer: renderTokenCell("descriptionTokens"),
    },
  ];

  onMount(() => {
    const el = host();
    if (!el) return;
    api = createGrid<RowData>(el, {
      columnDefs: baseColumns,
      rowData: options.skills(),
      rowHeight: 44,
      getRowId: (params) => `${params.data.group?.label ?? ""}\0${params.data.skill.id}`,
      defaultColDef: { resizable: true, sortable: true },
      suppressCellFocus: true,
      suppressScrollOnNewData: true,
      onRowClicked: (params: RowClickedEvent) => {
        const data = params.data;
        if (!data) return;
        const trigger = (params.event as MouseEvent)?.target as HTMLElement;
        options.onSelect(data.skill, trigger ?? (params.event as MouseEvent)?.currentTarget as HTMLElement);
      },
    });
  });

  createEffect(() => {
    api?.setGridOption("rowData", options.skills());
  });

  createEffect(() => {
    options.selectedId?.();
    const el = host();
    if (!el) return;
    const selectedId = options.selectedId?.();
    el.querySelectorAll(".ag-row").forEach((row) => {
      const rowId = row.getAttribute("row-id") ?? "";
      const skillId = rowId.includes("\0") ? rowId.slice(rowId.indexOf("\0") + 1) : rowId;
      row.classList.toggle("is-selected", skillId === selectedId);
    });
  });

  onCleanup(() => api?.destroy());
}
