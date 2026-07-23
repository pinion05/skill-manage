import type { APIRoute } from "astro";
import { InvalidScanModeError, parseScanMode } from "../../../lib/inventory/scan-mode";
import { inventoryStore, SkillNotFoundError } from "../../../lib/inventory/store";

export const prerender = false;

/**
 * Delete a skill.md file by inventory id.
 *
 * The path comes from the scanner's canonical record, never from the request,
 * so there is no path-traversal surface. Deletion is irreversible; the client
 * must show a confirmation dialog before calling this endpoint.
 */
export const DELETE: APIRoute = async ({ url }) => {
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
    const deleted = await inventoryStore.deleteSkill(id, mode);
    return Response.json(deleted, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SkillNotFoundError) {
      return Response.json(
        { error: "현재 인벤토리에 없는 skill입니다. 재검색해 주세요." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json(
        { error: "파일이 이미 삭제되었습니다. 인벤토리를 재검색해 주세요." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Skill deletion failed", error);
    return Response.json(
      { error: "skill 삭제에 실패했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
