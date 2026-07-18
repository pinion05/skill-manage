import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/inventory/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/inventory/store")>();
  return {
    ...actual,
    inventoryStore: {
      getInventory: vi.fn(async () => ({})),
      refreshInventory: vi.fn(async () => ({})),
      getSkillContent: vi.fn(async () => ({})),
    },
  };
});
import { GET as getInventory } from "./index";
import { POST as refreshInventory } from "./refresh";
import { GET as getSkillContent } from "../skills/content";

async function expectInvalidMode(
  handler: (context: never) => Response | Promise<Response>,
  url: string,
): Promise<void> {
  const response = await handler({ url: new URL(url) } as never);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "검색 범위는 official 또는 full이어야 합니다.",
  });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

describe("inventory API scan mode validation", () => {
  it("rejects an invalid GET inventory mode before scanning", async () => {
    await expectInvalidMode(getInventory, "http://127.0.0.1/api/inventory?mode=filesystem");
  });

  it("rejects an invalid refresh mode before scanning", async () => {
    await expectInvalidMode(
      refreshInventory,
      "http://127.0.0.1/api/inventory/refresh?mode=filesystem",
    );
  });

  it("rejects an invalid content mode before resolving a skill ID", async () => {
    await expectInvalidMode(
      getSkillContent,
      "http://127.0.0.1/api/skills/content?id=skill-a&mode=filesystem",
    );
  });
});
