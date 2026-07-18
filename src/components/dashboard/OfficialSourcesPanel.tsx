import { For, Show } from "solid-js";
import type {
  OfficialAgentSource,
  OfficialSharedSource,
  OfficialSourceRoot,
  OfficialSourceScope,
  OfficialSourceSummary,
} from "../../lib/inventory/types";

interface Props {
  summary: OfficialSourceSummary;
}

interface SourceOwnerGroup {
  id: string;
  name: string;
  globalPaths: string[];
  projectPaths: string[];
  documentationUrl?: string;
  shared: boolean;
}

const scopeLabels: Record<OfficialSourceScope, string> = {
  user: "사용자",
  project: "프로젝트",
  admin: "관리자",
};

function sharedGroup(source: OfficialSharedSource): SourceOwnerGroup {
  return { ...source, shared: true };
}

function agentGroup(source: OfficialAgentSource): SourceOwnerGroup {
  return { ...source, shared: false };
}

export function OfficialSourcesPanel(props: Props) {
  const hasSharedSource = () =>
    props.summary.shared.globalPaths.length + props.summary.shared.projectPaths.length > 0;
  const groups = () => [
    ...(hasSharedSource() ? [sharedGroup(props.summary.shared)] : []),
    ...props.summary.agents.map(agentGroup),
  ];
  const rootsFor = (ownerId: string): OfficialSourceRoot[] =>
    props.summary.roots.filter(({ owner }) => owner.id === ownerId);

  return (
    <section class="official-sources" aria-labelledby="official-sources-title">
      <header class="official-sources-heading">
        <div>
          <p class="section-kicker">CANONICAL PROVENANCE</p>
          <h2 id="official-sources-title">공식 Skill 소스</h2>
          <p>
            호환 client는 숨기고 각 디렉터리를 하나의 vendor 또는 공유 소유자에만 귀속합니다.
          </p>
        </div>
        <span>{groups().length.toLocaleString("ko-KR")} SOURCE OWNERS</span>
      </header>

      <Show
        when={groups().length > 0}
        fallback={<div class="official-source-empty">확인된 공식 소스 정보가 없습니다.</div>}
      >
        <div class="official-agent-list">
          <For each={groups()}>
            {(group) => {
              const roots = () => rootsFor(group.id);
              const foundCount = () => roots().filter(({ exists }) => exists).length;
              const skillCount = () => roots().reduce((total, root) => total + root.skillCount, 0);
              return (
                <article
                  class="official-agent-row"
                  classList={{ "is-shared-owner": group.shared }}
                  data-owner-id={group.id}
                >
                  <header>
                    <div>
                      <h3>{group.name}</h3>
                      <p>
                        발견 root {foundCount().toLocaleString("ko-KR")}개 · source sighting {skillCount().toLocaleString("ko-KR")}개
                      </p>
                    </div>
                    <Show when={group.documentationUrl}>
                      {(documentationUrl) => (
                        <a
                          href={documentationUrl()}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`${group.name} 공식 문서`}
                        >
                          공식 문서 ↗
                        </a>
                      )}
                    </Show>
                  </header>

                  <div class="official-patterns">
                    <div>
                      <span>USER / GLOBAL</span>
                      <Show when={group.globalPaths.length > 0} fallback={<em>소유한 전역 경로 없음</em>}>
                        <For each={group.globalPaths}>{(rootPath) => <code>{rootPath}</code>}</For>
                      </Show>
                    </div>
                    <div>
                      <span>PROJECT / WORKSPACE</span>
                      <Show when={group.projectPaths.length > 0} fallback={<em>소유한 프로젝트 경로 없음</em>}>
                        <For each={group.projectPaths}>{(rootPath) => <code>{rootPath}</code>}</For>
                      </Show>
                    </div>
                  </div>

                  <Show when={roots().length > 0}>
                    <ul class="official-root-list">
                      <For each={roots()}>
                        {(root) => (
                          <li classList={{ missing: !root.exists }}>
                            <div>
                              <span>{scopeLabels[root.scope]}</span>
                              <strong>
                                {root.exists
                                  ? `발견 · Skill ${root.skillCount.toLocaleString("ko-KR")}개`
                                  : "미발견"}
                              </strong>
                            </div>
                            <code>{root.path}</code>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </article>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
}
