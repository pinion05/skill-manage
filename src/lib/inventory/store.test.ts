import { describe, expect, it, vi } from "vitest";
import type { InventorySnapshot, SkillContent, SkillRecord } from "./types";
import { createInventoryStore, SkillNotFoundError } from "./store";

function snapshot(id = "skill-a"): InventorySnapshot {
  const skill: SkillRecord = {
    id,
    name: "alpha",
    description: "Alpha",
    path: `/tmp/${id}/SKILL.md`,
    fileName: "SKILL.md",
    recordType: "skill",
    skillsRoot: `/tmp/${id}`,
    configRoot: "/tmp",
    agent: "tmp",
    kind: "other",
    modifiedAt: new Date(0).toISOString(),
    size: 10,
    device: 1,
    inode: 2,
    sourceSightings: [],
  };
  return {
    scanMode: "official",
    officialSources: { agents: [], roots: [] },
    generatedAt: new Date(0).toISOString(),
    durationMs: 1,
    searchRoots: ["/tmp"],
    skills: [skill],
    links: [],
    roots: [],
    errors: { count: 0, samples: [] },
    stats: {
      matchedFiles: 1,
      skillDefinitions: 1,
      documents: 0,
      uniqueNames: 1,
      configRoots: 1,
      healthyLinks: 0,
      brokenLinks: 0,
      errorCount: 0,
    },
  };
}

describe("createInventoryStore", () => {
  it("shares one in-flight initial scan", async () => {
    let release: ((value: InventorySnapshot) => void) | undefined;
    const scan = vi.fn(
      () =>
        new Promise<InventorySnapshot>((resolve) => {
          release = resolve;
        }),
    );
    const store = createInventoryStore({ scan });

    const first = store.getInventory();
    const second = store.getInventory();
    expect(scan).toHaveBeenCalledTimes(1);

    const result = snapshot();
    release?.(result);
    await expect(first).resolves.toBe(result);
    await expect(second).resolves.toBe(result);
  });

  it("keeps the previous snapshot when refresh fails", async () => {
    const initial = snapshot();
    const scan = vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error("scan failed"));
    const store = createInventoryStore({ scan });

    await expect(store.getInventory()).resolves.toBe(initial);
    await expect(store.refreshInventory()).rejects.toThrow("scan failed");
    await expect(store.getInventory()).resolves.toBe(initial);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("rejects content IDs outside the current snapshot", async () => {
    const store = createInventoryStore({ scan: async () => snapshot() });
    await store.getInventory();

    await expect(store.getSkillContent("unknown")).rejects.toBeInstanceOf(SkillNotFoundError);
  });

  it("loads content only for the matching snapshot record", async () => {
    const expected: SkillContent = {
      id: "skill-a",
      path: "/tmp/skill-a/SKILL.md",
      markdown: "# Alpha",
      html: "<h1>Alpha</h1>",
    };
    const loadContent = vi.fn(async () => expected);
    const store = createInventoryStore({ scan: async () => snapshot(), loadContent });

    await expect(store.getSkillContent("skill-a")).resolves.toBe(expected);
    expect(loadContent).toHaveBeenCalledWith(expect.objectContaining({ id: "skill-a" }));
  });
});
