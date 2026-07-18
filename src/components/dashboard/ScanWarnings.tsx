import { For } from "solid-js";
import type { ScanError } from "../../lib/inventory/types";

interface Props {
  count: number;
  samples: ScanError[];
}

export function ScanWarnings(props: Props) {
  return (
    <details class="scan-warnings">
      <summary>
        <strong>검색 경고 {props.count.toLocaleString("ko-KR")}개</strong>
        <span>나머지 경로의 결과는 정상적으로 표시됩니다.</span>
      </summary>
      <div class="warning-samples">
        <p>대표 경로 {props.samples.length.toLocaleString("ko-KR")}개</p>
        <ul>
          <For each={props.samples}>
            {(error) => (
              <li>
                <span>{error.code}</span>
                <code>{error.path}</code>
                <small>{error.message}</small>
              </li>
            )}
          </For>
        </ul>
      </div>
    </details>
  );
}
