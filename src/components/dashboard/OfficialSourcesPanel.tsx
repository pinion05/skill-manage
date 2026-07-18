import { For, Show } from "solid-js";
import type {
  OfficialSourceKind,
  OfficialSourceScope,
  OfficialSourceSummary,
} from "../../lib/inventory/types";

interface Props {
  summary: OfficialSourceSummary;
}

const kindLabels: Record<OfficialSourceKind, string> = {
  native: "native",
  shared: "shared",
  compatibility: "compatibility",
};

const scopeLabels: Record<OfficialSourceScope, string> = {
  user: "사용자",
  project: "프로젝트",
  admin: "관리자",
};

export function OfficialSourcesPanel(props: Props) {
  const rootsFor = (agentName: string) =>
    props.summary.roots.filter(({ agents }) => agents.includes(agentName));

  return (
    <section class="official-sources" aria-labelledby="official-sources-title">
      <header class="official-sources-heading">
        <div>
          <p class="section-kicker">FIRST-PARTY PROVENANCE</p>
          <h2 id="official-sources-title">공식 Skill 소스</h2>
          <p>
            공식 제품 문서나 제품 소유 조직의 저장소에서 정확한 경로가 확인된 에이전트만
            표시합니다.
          </p>
        </div>
        <span>{props.summary.agents.length.toLocaleString("ko-KR")} AGENTS</span>
      </header>

      <Show
        when={props.summary.agents.length > 0}
        fallback={<div class="official-source-empty">확인된 공식 소스 정보가 없습니다.</div>}
      >
        <div class="official-agent-list">
          <For each={props.summary.agents}>
            {(agent) => {
              const roots = () => rootsFor(agent.name);
              const foundCount = () => roots().filter(({ exists }) => exists).length;
              const skillCount = () => roots().reduce((total, root) => total + root.skillCount, 0);
              return (
                <article class="official-agent-row">
                  <header>
                    <div>
                      <h3>{agent.name}</h3>
                      <p>
                        발견 root {foundCount().toLocaleString("ko-KR")}개 · source sighting {skillCount().toLocaleString("ko-KR")}개
                      </p>
                    </div>
                    <a
                      href={agent.documentationUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`${agent.name} 공식 문서`}
                    >
                      공식 문서 ↗
                    </a>
                  </header>

                  <div class="official-patterns">
                    <div>
                      <span>USER / GLOBAL</span>
                      <Show when={agent.globalPaths.length > 0} fallback={<em>문서화된 전역 경로 없음</em>}>
                        <For each={agent.globalPaths}>{(rootPath) => <code>{rootPath}</code>}</For>
                      </Show>
                    </div>
                    <div>
                      <span>PROJECT / WORKSPACE</span>
                      <Show when={agent.projectPaths.length > 0} fallback={<em>자동 프로젝트 경로 없음</em>}>
                        <For each={agent.projectPaths}>{(rootPath) => <code>{rootPath}</code>}</For>
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
                            <small>{root.kinds.map((kind) => kindLabels[kind]).join(" · ")}</small>
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
