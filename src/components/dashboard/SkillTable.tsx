import { For, Show } from "solid-js";
import type { PageResult } from "../../lib/dashboard/filter";
import type { SkillRecord } from "../../lib/inventory/types";
import { kindLabel } from "./FilterBar";

interface Props {
  page: PageResult<SkillRecord>;
  selectedId?: string;
  onSelect: (skill: SkillRecord, trigger: HTMLButtonElement) => void;
  onPage: (page: number) => void;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

export function SkillTable(props: Props) {
  return (
    <section class="ledger" aria-label="Skill 목록">
      <Show
        when={props.page.items.length > 0}
        fallback={
          <div class="empty-state">
            <span aria-hidden="true">∅</span>
            <strong>조건에 맞는 skill이 없습니다.</strong>
            <p>검색어를 줄이거나 필터를 초기화하세요.</p>
          </div>
        }
      >
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">설명</th>
                <th scope="col">설정 / 성격</th>
                <th scope="col">수정</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.page.items}>
                {(skill, index) => (
                  <tr
                    classList={{ "is-selected": props.selectedId === skill.id }}
                    style={`--row-index:${Math.min(index(), 12)}`}
                  >
                    <td class="skill-identity">
                      <button
                        type="button"
                        class="skill-name"
                        aria-label={`${skill.name} 상세 보기`}
                        onClick={(event) => props.onSelect(skill, event.currentTarget)}
                      >
                        <span class="record-mark" data-document={skill.recordType === "document"}>
                          {skill.recordType === "skill" ? "S" : "D"}
                        </span>
                        <span>{skill.name}</span>
                      </button>
                      <code title={skill.path}>{skill.path}</code>
                    </td>
                    <td class="skill-description">
                      {skill.description || <span class="muted-value">설명 없음</span>}
                    </td>
                    <td class="skill-source">
                      <strong>{skill.agent}</strong>
                      <span>{kindLabel(skill.kind)}</span>
                    </td>
                    <td class="skill-date">
                      <time datetime={skill.modifiedAt}>{dateFormatter.format(new Date(skill.modifiedAt))}</time>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        <nav class="pagination" aria-label="Skill 목록 페이지">
          <span>
            {props.page.total.toLocaleString("ko-KR")}개 중{" "}
            {((props.page.page - 1) * props.page.pageSize + 1).toLocaleString("ko-KR")}–
            {Math.min(props.page.page * props.page.pageSize, props.page.total).toLocaleString("ko-KR")}
          </span>
          <div>
            <button
              type="button"
              onClick={() => props.onPage(props.page.page - 1)}
              disabled={props.page.page <= 1}
              aria-label="이전 페이지"
            >
              ←
            </button>
            <b>
              {props.page.page} / {props.page.pageCount}
            </b>
            <button
              type="button"
              onClick={() => props.onPage(props.page.page + 1)}
              disabled={props.page.page >= props.page.pageCount}
              aria-label="다음 페이지"
            >
              →
            </button>
          </div>
        </nav>
      </Show>
    </section>
  );
}
