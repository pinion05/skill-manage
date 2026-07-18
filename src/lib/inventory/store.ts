import { readSkillContent } from "./markdown";
import { scanInventory } from "./scanner";
import type { InventorySnapshot, SkillContent, SkillRecord } from "./types";

export class SkillNotFoundError extends Error {
  constructor(id: string) {
    super(`현재 인벤토리에서 skill ID를 찾을 수 없습니다: ${id}`);
    this.name = "SkillNotFoundError";
  }
}

export interface InventoryStoreDependencies {
  scan?: () => Promise<InventorySnapshot>;
  loadContent?: (record: SkillRecord) => Promise<SkillContent>;
}

export interface InventoryStore {
  getInventory: () => Promise<InventorySnapshot>;
  refreshInventory: () => Promise<InventorySnapshot>;
  getSkillContent: (id: string) => Promise<SkillContent>;
}

export function createInventoryStore(
  dependencies: InventoryStoreDependencies = {},
): InventoryStore {
  const scan = dependencies.scan ?? (() => scanInventory());
  const loadContent = dependencies.loadContent ?? readSkillContent;
  let snapshot: InventorySnapshot | undefined;
  let inFlight: Promise<InventorySnapshot> | undefined;

  const runScan = (force: boolean): Promise<InventorySnapshot> => {
    if (inFlight) return inFlight;
    if (!force && snapshot) return Promise.resolve(snapshot);

    inFlight = scan()
      .then((nextSnapshot) => {
        snapshot = nextSnapshot;
        return nextSnapshot;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  return {
    getInventory: () => runScan(false),
    refreshInventory: () => runScan(true),
    getSkillContent: async (id: string) => {
      const current = await runScan(false);
      const record = current.skills.find((skill) => skill.id === id);
      if (!record) throw new SkillNotFoundError(id);
      return loadContent(record);
    },
  };
}

export const inventoryStore = createInventoryStore();
