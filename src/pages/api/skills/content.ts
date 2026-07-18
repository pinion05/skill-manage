import type { APIRoute } from "astro";
import { InvalidSkillFileError } from "../../../lib/inventory/markdown";
import { InvalidScanModeError, parseScanMode } from "../../../lib/inventory/scan-mode";
import { inventoryStore, SkillNotFoundError } from "../../../lib/inventory/store";

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

  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return Response.json(
      { error: "skill ID가 필요합니다." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const content = await inventoryStore.getSkillContent(id, mode);
    return Response.json(content, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SkillNotFoundError) {
      return Response.json(
        { error: "현재 인벤토리에 없는 skill입니다. 재검색해 주세요." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof InvalidSkillFileError) {
      return Response.json(
        { error: error.message },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json(
        { error: "파일이 사라졌습니다. 인벤토리를 재검색해 주세요." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Skill content read failed", error);
    return Response.json(
      { error: "skill 본문을 읽지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
