import type { APIRoute } from "astro";
import { InvalidScanModeError, parseScanMode } from "../../../lib/inventory/scan-mode";
import { inventoryStore } from "../../../lib/inventory/store";

export const prerender = false;

/**
 * GET /api/inventory/scan?mode=official
 *
 * Server-Sent Events 스트림.
 * 이벤트:
 *   - "progress": ScanProgress JSON (디렉터리/스킬/링크 카운트)
 *   - "done":    InventorySnapshot JSON (최종 결과)
 *   - "error":   에러 메시지
 *
 * 클라이언트는 EventSource로 수신.
 * cache를 강제한다 (force=true).
 */
export const GET: APIRoute = async ({ url }) => {
  let mode;
  try {
    mode = parseScanMode(url.searchParams.get("mode"));
  } catch (error) {
    if (error instanceof InvalidScanModeError) {
      return new Response(
        JSON.stringify({ error: "검색 범위는 official 또는 full이어야 합니다." }),
        { status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
      };

      try {
        const snapshot = await inventoryStore.refreshInventory(mode, (progress) => {
          send("progress", progress);
        });
        send("done", snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "파일시스템 인벤토리를 불러오지 못했습니다.";
        send("error", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
