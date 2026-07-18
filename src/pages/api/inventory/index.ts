import type { APIRoute } from "astro";
import { inventoryStore } from "../../../lib/inventory/store";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const inventory = await inventoryStore.getInventory();
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
