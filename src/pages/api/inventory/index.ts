import type { APIRoute } from "astro";
import { InvalidScanModeError, parseScanMode } from "../../../lib/inventory/scan-mode";
import { inventoryStore } from "../../../lib/inventory/store";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
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
    const inventory = await inventoryStore.getInventory(mode);
    return Response.json(inventory, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Initial inventory scan failed", error);
    return Response.json(
      { error: "파일시스템 인벤토리를 불러오지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
