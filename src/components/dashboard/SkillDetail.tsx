import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { SkillContent, SkillRecord } from "../../lib/inventory/types";
import { kindLabel } from "./FilterBar";

interface Props {
  skill: SkillRecord;
  duplicates: SkillRecord[];
  onClose: () => void;
}

async function fetchContent(id: string): Promise<SkillContent> {
  const response = await fetch(`/api/skills/content?id=${encodeURIComponent(id)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "본문을 읽지 못했습니다.");
  return body as SkillContent;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SkillDetail(props: Props) {
  const [content] = createResource(() => props.skill.id, fetchContent);
  const [copyState, setCopyState] = createSignal("경로 복사");

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose();
  };
  onMount(() => window.addEventListener("keydown", onKeyDown));
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(props.skill.path);
      setCopyState("복사됨");
      window.setTimeout(() => setCopyState("경로 복사"), 1200);
    } catch {
      setCopyState("복사 실패");
    }
  };

  return (
    <>
      <button class="detail-backdrop" type="button" aria-label="상세 닫기" onClick={props.onClose} />
      <aside class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="skill-detail-title">
        <header class="detail-header">
          <div>
            <p class="section-kicker">SKILL INSPECTOR</p>
            <h2 id="skill-detail-title" tabindex="-1">{props.skill.name}</h2>
            <p>{props.skill.description || "frontmatter 설명이 없습니다."}</p>
          </div>
          <button class="detail-close" type="button" aria-label="상세 닫기" onClick={props.onClose}>×</button>
        </header>

        <dl class="detail-meta">
          <div><dt>에이전트</dt><dd>{props.skill.agent}</dd></div>
          <div><dt>성격</dt><dd>{kindLabel(props.skill.kind)}</dd></div>
          <div><dt>파일</dt><dd>{props.skill.recordType === "skill" ? "SKILL.md" : "skills.md 문서"}</dd></div>
          <div><dt>크기</dt><dd>{props.skill.size.toLocaleString("ko-KR")} B</dd></div>
          <div><dt>수정</dt><dd>{dateFormatter.format(new Date(props.skill.modifiedAt))}</dd></div>
        </dl>

        <section class="detail-path" aria-label="파일 경로">
          <div><span>ABSOLUTE PATH</span><button type="button" onClick={copyPath}>{copyState()}</button></div>
          <code>{props.skill.path}</code>
        </section>

        <Show when={props.duplicates.length > 0}>
          <section class="duplicate-list">
            <h3>같은 이름의 다른 위치 · {props.duplicates.length}</h3>
            <For each={props.duplicates}>{(duplicate) => <code>{duplicate.path}</code>}</For>
          </section>
        </Show>

        <section class="markdown-section">
          <div class="markdown-heading">
            <h3>본문</h3>
            <span>읽기 전용</span>
          </div>
          <Show when={!content.loading} fallback={<div class="detail-loading">Markdown을 읽는 중</div>}>
            <Show
              when={!content.error}
              fallback={<div class="detail-error">{content.error?.message ?? "본문을 읽지 못했습니다."}</div>}
            >
              <article class="markdown-body" innerHTML={content()?.html ?? ""} />
            </Show>
          </Show>
        </section>
      </aside>
    </>
  );
}
