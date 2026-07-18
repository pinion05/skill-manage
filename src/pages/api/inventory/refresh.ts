import type { APIRoute } from "astro";
import { InvalidScanModeError, parseScanMode } from "../../../lib/inventory/scan-mode";
import { inventoryStore } from "../../../lib/inventory/store";

export const prerender = false;

export const POST: APIRoute = async ({ url }) => {
  let mode;
  try {
    mode = parseScanMode(url.searchParams.get("mode"));
  } catch (error) {
    if (error instanceof InvalidScanModeError) {
      return Response.json(
        { error: "검색 범위는 official 또는 full이어야 합니다." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }

  try {
    const inventory = await inventoryStore.refreshInventory(mode);
    return Response.json(inventory, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Inventory refresh failed", error);
    return Response.json(
      { error: "재검색에 실패했습니다. 이전 인벤토리는 유지됩니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
