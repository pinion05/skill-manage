import { createMemo, createSignal, For, Show } from "solid-js";
import type { InventoryRoot, SkillLink } from "../../lib/inventory/types";

interface Props {
  links: SkillLink[];
  roots: InventoryRoot[];
}

export function LinkHealthPanel(props: Props) {
  const [status, setStatus] = createSignal<"all" | "broken" | "healthy">("broken");
  const linkRoots = createMemo(() =>
    props.roots
      .filter((root) => root.healthyLinks + root.brokenLinks > 0)
      .toSorted(
        (left, right) =>
          right.brokenLinks - left.brokenLinks ||
          right.healthyLinks - left.healthyLinks ||
          left.configRoot.localeCompare(right.configRoot),
      ),
  );
  const visibleLinks = createMemo(() => {
    const filtered = status() === "all" ? props.links : props.links.filter((link) => link.status === status());
    return filtered.toSorted(
      (left, right) =>
        Number(left.status === "healthy") - Number(right.status === "healthy") ||
        left.path.localeCompare(right.path),
    );
  });

  return (
    <section class="link-health" aria-labelledby="link-health-title">
      <div class="link-health-heading">
        <div>
          <p class="section-kicker">SYMLINK AUDIT</p>
          <h2 id="link-health-title">Skill 링크 상태</h2>
          <p>표시만 하며 링크를 생성하거나 삭제하지 않습니다.</p>
        </div>
        <div class="segmented-control" aria-label="링크 상태 필터">
          <For each={["broken", "healthy", "all"] as const}>
            {(value) => (
              <button
                type="button"
                classList={{ active: status() === value }}
                aria-pressed={status() === value}
                onClick={() => setStatus(value)}
              >
                {value === "broken" ? "깨짐" : value === "healthy" ? "정상" : "전체"}
              </button>
            )}
          </For>
        </div>
      </div>

      <section class="root-audit" aria-labelledby="root-audit-title">
        <h3 id="root-audit-title">설정 루트별 링크</h3>
        <div class="root-audit-list">
          <For each={linkRoots()}>
            {(root) => (
              <article data-root-summary={root.configRoot}>
                <div>
                  <strong>{root.agent}</strong>
                  <code class="root-path">{root.configRoot}</code>
                </div>
                <span class="healthy">정상 {root.healthyLinks.toLocaleString("ko-KR")}</span>
                <span class="broken">깨짐 {root.brokenLinks.toLocaleString("ko-KR")}</span>
              </article>
            )}
          </For>
        </div>
      </section>

      <Show
        when={visibleLinks().length > 0}
        fallback={<p class="link-empty">선택한 상태의 링크가 없습니다.</p>}
      >
        <div class="link-list">
          <For each={visibleLinks()}>
            {(link) => (
              <article class="link-row">
                <span class={`link-status ${link.status}`}>
                  <i aria-hidden="true" />
                  {link.status === "healthy" ? "정상" : "깨짐"}
                </span>
                <div>
                  <strong>{link.agent}</strong>
                  <code title={link.path}>{link.path}</code>
                </div>
                <span class="link-arrow" aria-hidden="true">→</span>
                <code class="link-target" title={link.target}>{link.target}</code>
                <span class="contains-skill">{link.containsSkill ? "SKILL 있음" : "SKILL 없음"}</span>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
