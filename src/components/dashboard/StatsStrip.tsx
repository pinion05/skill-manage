import { For } from "solid-js";
import type { InventoryStats } from "../../lib/inventory/types";

interface Props {
  stats: InventoryStats;
}

export function StatsStrip(props: Props) {
  const metrics = () => [
    { key: "skills", label: "SKILL 정의", value: props.stats.skillDefinitions },
    { key: "unique", label: "고유 이름", value: props.stats.uniqueNames },
    { key: "roots", label: "설정 루트", value: props.stats.configRoots },
    { key: "healthy", label: "정상 링크", value: props.stats.healthyLinks },
    { key: "broken", label: "깨진 링크", value: props.stats.brokenLinks, danger: true },
    { key: "errors", label: "검색 경고", value: props.stats.errorCount, warning: true },
  ];

  return (
    <section class="stats-strip" aria-label="인벤토리 통계">
      <For each={metrics()}>
        {(metric) => (
          <div
            class="stat-cell"
            classList={{ "is-danger": metric.danger, "is-warning": metric.warning }}
          >
            <span>{metric.label}</span>
            <strong data-stat={metric.key}>{metric.value.toLocaleString("ko-KR")}</strong>
          </div>
        )}
      </For>
    </section>
  );
}
