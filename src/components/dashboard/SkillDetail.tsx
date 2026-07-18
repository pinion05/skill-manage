import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type {
  OfficialSourceKind,
  OfficialSourceScope,
  ScanMode,
  SkillContent,
  SkillRecord,
} from "../../lib/inventory/types";
import { kindLabel } from "./FilterBar";

interface Props {
  skill: SkillRecord;
  scanMode: ScanMode;
  duplicates: SkillRecord[];
  returnFocus?: HTMLElement;
  onClose: () => void;
}

async function fetchContent(source: { id: string; mode: ScanMode }): Promise<SkillContent> {
  const response = await fetch(
    `/api/skills/content?id=${encodeURIComponent(source.id)}&mode=${source.mode}`,
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "본문을 읽지 못했습니다.");
  return body as SkillContent;
}

const sourceKindLabels: Record<OfficialSourceKind, string> = {
  native: "native",
  shared: "shared",
  compatibility: "compatibility",
};

const sourceScopeLabels: Record<OfficialSourceScope, string> = {
  user: "사용자",
  project: "프로젝트",
  admin: "관리자",
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SkillDetail(props: Props) {
  const [content] = createResource(
    () => ({ id: props.skill.id, mode: props.scanMode }),
    fetchContent,
  );
  const [copyState, setCopyState] = createSignal("경로 복사");
  let panel!: HTMLElement;
  let heading!: HTMLHeadingElement;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.getClientRects().length > 0 || import.meta.env.MODE === "test");
    if (focusable.length === 0) {
      event.preventDefault();
      heading.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === heading ||
        document.activeElement === first ||
        !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === heading ||
        document.activeElement === last ||
        !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  };
  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => heading.focus());
  });
  onCleanup(() => {
    window.removeEventListener("keydown", onKeyDown);
    props.returnFocus?.focus();
  });

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
      <button class="detail-backdrop" type="button" tabindex="-1" aria-hidden="true" onClick={props.onClose} />
      <aside ref={panel} class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="skill-detail-title">
        <header class="detail-header">
          <div>
            <p class="section-kicker">SKILL INSPECTOR</p>
            <h2 ref={heading} id="skill-detail-title" tabindex="-1">{props.skill.name}</h2>
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
          <div class="detail-config-root"><dt>설정 루트</dt><dd><code>{props.skill.configRoot}</code></dd></div>
        </dl>

        <section class="detail-path" aria-label="파일 경로">
          <div><span>ABSOLUTE PATH</span><button type="button" onClick={copyPath}>{copyState()}</button></div>
          <code>{props.skill.path}</code>
        </section>

        <Show when={props.skill.sourceSightings.length > 0}>
          <section class="source-sighting-list" aria-labelledby="source-sighting-title">
            <h3 id="source-sighting-title">공식 소스 경로</h3>
            <ul>
              <For each={props.skill.sourceSightings}>
                {(sighting) => (
                  <li>
                    <div>
                      <strong>{sighting.agents.join(" · ")}</strong>
                      <span>
                        {sourceScopeLabels[sighting.scope]} · {sighting.kinds
                          .map((kind) => sourceKindLabels[kind])
                          .join(" · ")}
                      </span>
                    </div>
                    <code>{sighting.path}</code>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

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
