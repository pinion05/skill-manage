import { describe, expect, it, vi } from "vitest";
import type { InventorySnapshot, SkillContent, SkillRecord } from "./types";
import { createInventoryStore, SkillNotFoundError } from "./store";

function snapshot(
  id = "skill-a",
  scanMode: InventorySnapshot["scanMode"] = "official",
): InventorySnapshot {
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
    scanMode,
    officialSources: {
      shared: { id: "shared", name: "공유 디렉터리", globalPaths: [], projectPaths: [] },
      agents: [],
      roots: [],
    },
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
      (_mode: InventorySnapshot["scanMode"]) =>
        new Promise<InventorySnapshot>((resolve) => {
          release = resolve;
        }),
    );
    const store = createInventoryStore({ scan });

    const first = store.getInventory();
    const second = store.getInventory();
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith("official");

    const result = snapshot();
    release?.(result);
    await expect(first).resolves.toBe(result);
    await expect(second).resolves.toBe(result);
  });

  it("keeps separate snapshots and in-flight scans for each mode", async () => {
    const scan = vi.fn(async (mode: InventorySnapshot["scanMode"]) =>
      mode === "official" ? snapshot("official-skill", mode) : snapshot("full-skill", mode),
    );
    const store = createInventoryStore({ scan });

    const firstOfficial = store.getInventory("official");
    const secondOfficial = store.getInventory("official");
    const full = store.getInventory("full");

    expect(scan).toHaveBeenCalledTimes(2);
    await expect(firstOfficial).resolves.toMatchObject({ scanMode: "official" });
    await expect(secondOfficial).resolves.toMatchObject({ scanMode: "official" });
    await expect(full).resolves.toMatchObject({ scanMode: "full" });
    expect(scan).toHaveBeenNthCalledWith(1, "official");
    expect(scan).toHaveBeenNthCalledWith(2, "full");
  });

  it("keeps the previous snapshot when refresh fails", async () => {
    const initial = snapshot();
    const scan = vi
      .fn<(mode: InventorySnapshot["scanMode"]) => Promise<InventorySnapshot>>()
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error("scan failed"));
    const store = createInventoryStore({ scan });

    await expect(store.getInventory()).resolves.toBe(initial);
    await expect(store.refreshInventory()).rejects.toThrow("scan failed");
    await expect(store.getInventory()).resolves.toBe(initial);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("uses the requested mode snapshot as the content allowlist", async () => {
    const loadContent = vi.fn(async (record: SkillRecord): Promise<SkillContent> => ({
      id: record.id,
      path: record.path,
      markdown: "# Content",
      html: "<h1>Content</h1>",
    }));
    const store = createInventoryStore({
      scan: async (mode) =>
        mode === "full" ? snapshot("full-only", "full") : snapshot("official-only", "official"),
      loadContent,
    });

    await expect(store.getSkillContent("full-only", "official")).rejects.toBeInstanceOf(
      SkillNotFoundError,
    );
    await expect(store.getSkillContent("full-only", "full")).resolves.toMatchObject({
      id: "full-only",
    });
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
