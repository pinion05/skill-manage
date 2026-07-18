import type { APIRoute } from "astro";
import { inventoryStore } from "../../../lib/inventory/store";

export const prerender = false;

export const POST: APIRoute = async () => {
  try {
    const inventory = await inventoryStore.refreshInventory();
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
